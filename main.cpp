#include <Arduino.h>
#include "transport.h"
#include "wifi_gateway.h"
#include "esp_system.h"
#include "pins.h"
#include "modules/shared/atech_helpers.h"
#include "modules/audio/speaker.h"
#include "modules/storage/micro_sd_card.h"
#include "modules/audio/microphone.h"
#include "modules/led/neopixel.h"
#include "modules/input/button.h"
#include "modules/sensor/icm40608.h"
#include "i2c_software.h"

Speaker speaker(PIN_SPEAKER_B, PIN_SPEAKER_A, PIN_SPEAKER_D);
MicroSDCard micro_sd_card(PIN_MICRO_SD_CARD_A, PIN_MICRO_SD_CARD_B, PIN_MICRO_SD_CARD_C, PIN_MICRO_SD_CARD_D);
Microphone microphone(PIN_MICROPHONE_A, PIN_MICROPHONE_B, PIN_MICROPHONE_C, PIN_MICROPHONE_D);
NeoPixelGrid neopixel_grid(PIN_NEOPIXEL_GRID_A, PIN_NEOPIXEL_GRID_B);
NeoPixelGrid neopixel_grid_2(PIN_NEOPIXEL_GRID_2_A, PIN_NEOPIXEL_GRID_2_B);
NeoPixelGrid neopixel_grid_3(PIN_NEOPIXEL_GRID_3_A, PIN_NEOPIXEL_GRID_3_B);
ButtonModule button_module(PIN_BUTTON_MODULE_A, PIN_BUTTON_MODULE_B);
SoftwareI2C icm40608_imu_i2c(PIN_ICM40608_IMU_SDA, PIN_ICM40608_IMU_SCL);
ICM40608 icm40608_imu(&icm40608_imu_i2c);
ButtonModule button_module_2(PIN_BUTTON_MODULE_2_A, PIN_BUTTON_MODULE_2_B);

// ---- Voice recorder: record at 8 kHz, 16-bit mono, then send to the web app ----
static const uint32_t OUT_RATE = 8000;          // mic gives 16 kHz; keep every 2nd sample
static const uint32_t MAX_SECONDS = 15;
static int16_t* recBuf = nullptr;
static uint32_t recCap = 0;                       // samples
static volatile uint32_t recLen = 0;
static volatile bool capturing = false;
static volatile uint8_t decim = 0;

enum State { IDLE, RECORDING, SENDING };
static State state = IDLE;
static uint32_t sendPos = 0, sendSeq = 0, clipId = 0;
static unsigned long recStartMs = 0;
EveryTimer sendTimer, levelTimer;

static void audioTap(const int16_t* s, int n, void*) {
  if (!capturing) return;
  for (int i = 0; i < n; i++) {
    if ((decim++ & 1) != 0) continue;
    if (recLen >= recCap) { capturing = false; return; }
    recBuf[recLen++] = s[i];
  }
}

// Top button (button_module) = start/stop; left button (button_module_2) = cancel.
// The cancel button glows orange only while there is something to cancel.
static void setLight(uint8_t r, uint8_t g, uint8_t b) {
  button_module.setColor(r, g, b);
  bool busy = !(r == 0 && g == 40 && b == 0);
  if (busy) button_module_2.setColor(255, 80, 0); else button_module_2.setColor(0, 0, 0);
}

static void startRecording() {
  if (state == RECORDING || !recBuf) return;
  recLen = 0; decim = 0; capturing = true;
  state = RECORDING; recStartMs = millis(); clipId++;
  setLight(255, 0, 0);
  Serial.printf("{\"type\":\"recording\",\"payload\":{\"state\":\"started\",\"clip\":%lu}}\n", (unsigned long)clipId);
}

static void stopRecording() {
  if (state != RECORDING) return;
  capturing = false;
  state = SENDING; sendPos = 0; sendSeq = 0;
  setLight(0, 0, 255);
  Serial.printf("{\"type\":\"audio_start\",\"payload\":{\"clip\":%lu,\"sample_rate\":%lu,\"bits\":16,\"channels\":1,\"encoding\":\"pcm_s16le_base64\",\"samples\":%lu,\"seconds\":%.2f}}\n",
                (unsigned long)clipId, (unsigned long)OUT_RATE, (unsigned long)recLen, recLen / (float)OUT_RATE);
}

static void cancelClip() {
  if (state == IDLE) return;
  const char* what = (state == RECORDING) ? "recording" : "sending";
  capturing = false;
  state = IDLE; recLen = 0; sendPos = 0; sendSeq = 0;
  setLight(0, 40, 0);
  Serial.printf("{\"type\":\"audio_cancel\",\"payload\":{\"clip\":%lu,\"during\":\"%s\"}}\n",
                (unsigned long)clipId, what);
}

static const char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static void sendChunk() {
  const uint32_t CHUNK = 192;                     // samples = 384 bytes = 512 base64 chars
  uint32_t n = min(CHUNK, (uint32_t)recLen - sendPos);
  const uint8_t* p = (const uint8_t*)(recBuf + sendPos);
  uint32_t bytes = n * 2;
  static char out[600];
  uint32_t o = 0;
  for (uint32_t i = 0; i < bytes; i += 3) {
    uint32_t v = p[i] << 16;
    if (i + 1 < bytes) v |= p[i + 1] << 8;
    if (i + 2 < bytes) v |= p[i + 2];
    out[o++] = B64[(v >> 18) & 63];
    out[o++] = B64[(v >> 12) & 63];
    out[o++] = (i + 1 < bytes) ? B64[(v >> 6) & 63] : '=';
    out[o++] = (i + 2 < bytes) ? B64[v & 63] : '=';
  }
  out[o] = 0;
  Serial.printf("{\"type\":\"audio_chunk\",\"payload\":{\"clip\":%lu,\"seq\":%lu,\"data\":\"%s\"}}\n",
                (unsigned long)clipId, (unsigned long)sendSeq, out);
  sendPos += n; sendSeq++;
  if (sendPos >= recLen) {
    Serial.printf("{\"type\":\"audio_end\",\"payload\":{\"clip\":%lu,\"chunks\":%lu}}\n",
                  (unsigned long)clipId, (unsigned long)sendSeq);
    state = IDLE;
    setLight(0, 40, 0);
  }
}

static const char* resetReason() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_EXT: return "EXT";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INT_WDT";
    case ESP_RST_TASK_WDT: return "TASK_WDT";
    case ESP_RST_WDT: return "WDT";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
    default: return "UNKNOWN";
  }
}

void setup() {
  Serial.setRxBufferSize(8192); Serial.begin(115200); Serial.setTxTimeoutMs(0);
  p2p_transport_setup();
  icm40608_imu_i2c.begin(100000);
  speaker.begin();
  micro_sd_card.begin();
  microphone.begin();
  neopixel_grid.begin();
  neopixel_grid_2.begin();
  neopixel_grid_3.begin();
  button_module.begin();
  icm40608_imu.begin();
  icm40608_imu.setMountRotation(90);
  button_module_2.begin();

  // Own setup: the other modules stay idle; grids dark.
  neopixel_grid.clear(); neopixel_grid.show();
  neopixel_grid_2.clear(); neopixel_grid_2.show();
  neopixel_grid_3.clear(); neopixel_grid_3.show();
  for (uint32_t s = MAX_SECONDS; s >= 3 && !recBuf; s -= 3) {
    recCap = s * OUT_RATE;
    recBuf = (int16_t*)malloc(recCap * sizeof(int16_t));
  }
  if (!recBuf) recCap = 0;
  microphone.onAudio(audioTap, nullptr);
  setLight(0, 40, 0);

  Serial.printf("{\"type\":\"boot\",\"payload\":{\"reset_reason\":\"%s\",\"free_heap\":%u,\"modules\":["
    "{\"instance\":\"speaker\",\"module\":\"speaker\",\"ok\":true,\"detectable\":false},"
    "{\"instance\":\"micro_sd_card\",\"module\":\"micro_sd_card\",\"ok\":true,\"detectable\":false},"
    "{\"instance\":\"microphone\",\"module\":\"microphone\",\"ok\":true,\"detectable\":false},"
    "{\"instance\":\"neopixel_grid\",\"module\":\"neopixel_grid\",\"ok\":true,\"detectable\":false},"
    "{\"instance\":\"neopixel_grid_2\",\"module\":\"neopixel_grid\",\"ok\":true,\"detectable\":false},"
    "{\"instance\":\"neopixel_grid_3\",\"module\":\"neopixel_grid\",\"ok\":true,\"detectable\":false},"
    "{\"instance\":\"button_module\",\"module\":\"button_module\",\"ok\":true,\"detectable\":false},"
    "{\"instance\":\"icm40608_imu\",\"module\":\"icm40608_imu\",\"ok\":true,\"detectable\":false},"
    "{\"instance\":\"button_module_2\",\"module\":\"button_module\",\"ok\":true,\"detectable\":false}]}}\n",
    resetReason(), (unsigned)ESP.getFreeHeap());
  Serial.printf("{\"type\":\"recorder\",\"payload\":{\"max_seconds\":%lu,\"sample_rate\":%lu}}\n",
                (unsigned long)(recCap / OUT_RATE), (unsigned long)OUT_RATE);
}

void loop() {
  p2p_transport_loop();
  button_module.update();
  button_module_2.update();
  static unsigned long lastStartMs = 0, lastCancelMs = 0;   // the driver does not debounce
  bool startStop = false, cancel = false;
  if (button_module.wasPressed() && millis() - lastStartMs >= 300) { startStop = true; lastStartMs = millis(); }
  if (button_module_2.wasPressed() && millis() - lastCancelMs >= 300) { cancel = true; lastCancelMs = millis(); }

  P2PCommand cmd;
  while (p2p_next_command(&cmd)) {
    if (strcmp(cmd.action, "record") == 0) startRecording();
    else if (strcmp(cmd.action, "stop") == 0) stopRecording();
    else if (strcmp(cmd.action, "cancel") == 0) cancelClip();
  }

  // Cancel wins: it throws away the recording, or stops a send part-way.
  if (cancel) cancelClip();
  else if (startStop) {
    if (state == IDLE) startRecording();
    else if (state == RECORDING) stopRecording();   // stop = send
  }

  if (state == RECORDING) {
    if (!capturing) stopRecording();               // buffer full: stop and send
    else if (levelTimer.ready(250)) {
      Serial.printf("{\"type\":\"recording\",\"payload\":{\"state\":\"recording\",\"seconds\":%.1f,\"level\":%d}}\n",
                    recLen / (float)OUT_RATE, (int)microphone.getSoundLevel());
    }
  }

  if (state == SENDING) {
    if (sendTimer.ready(25)) sendChunk();         // paced so the link keeps up
    return;
  }
  delay(1);
}
