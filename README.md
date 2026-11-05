# Atech tilbakemeldinger

Brukere av en fasilitet legger igjen muntlige tilbakemeldinger på Atech-kortet. Webappen transkriberer dem, kategoriserer dem og samler like tilbakemeldinger i saker, som fasilitetens adminer kan søke i og prioritere.

```
Kort ──USB──▶ proxy/ ──HTTP──▶ web/ ──▶ Whisper
              (Python)       (Vercel)  └─▶ Supabase
```

- `main.cpp`: gjeldende firmware.
- `proxy/`: FastAPI-tjeneste som leser kortet over USB, setter sammen WAV-filer og leverer dem til webappen.
  Må kjøre på maskinen kortet står koblet til, ikke på Vercel.
- `web/`: TanStack Start-app på Vercel. Tar imot klipp, transkriberer og kategoriserer med OpenAI, lagrer i Supabase og viser oversikten.

## Proxy

```sh
cd proxy
cp .env.example .env   # fyll inn
uv run uvicorn main:app --port 8000
curl localhost:8000/health
uv run pytest
```

Proxyen finner kortet selv hvis bare ett er koblet til. Ellers setter du `SERIAL_PORT`. Bare ett program kan holde
porten, så lukk Atech-faner som er koblet til kortet over USB. `/health` viser `board_connected`.

Ferdige klipp ligger i `SPOOL_DIR` til webappen har svart, så de overlever nedetid og omstart. Klipp webappen
avviser (400, 413, 422) mister lyden, og bare metadataene blir liggende med endelsen `.rejected`.

### Test uten kort

```sh
uv run python fake_board.py   # skriver ut SERIAL_PORT, Enter sender et klipp
SERIAL_PORT=<porten> uv run uvicorn main:app --port 8000   # i en annen terminal
```

## Webapp

```sh
cd web
npm install
cp .env.example .env.local   # eller: vercel env pull .env.local
npm run db:migrate
npm run dev                  # http://localhost:3100
```

Kategoriene ligger i `src/lib/taxonomy.ts`.

### Fasiliteter og adminer

Enheter og adminer legges inn med et skript. Nye adminer får et midlertidig passord i utskriften.

```sh
npm run facility:add -- --name "Bygg A" --device <enhets-ID> --admin navn@eksempel.no
```

Klipp fra en enhet som ikke er koblet til en fasilitet, lagres og vises under «Without a case» med «Try again» etter at enheten er koblet til.

Endrer du `src/db/schema.ts`: kjør `npm run db:generate` og deretter `npm run db:migrate`.

Miljøvariabler er beskrevet i `web/.env.example`. Prosjektet deployes fra `web/` med `vercel deploy --prod`. Kobler du det til Git, må Root Directory settes til `web`.

## Sikkerhet

- Lyd lagres ikke i databasen, bare transkripsjonen. Proxyen holder WAV-fila på disk bare til webappen har transkribert og lagret klippet. Feiler Whisper, svarer webappen 503 og proxyen prøver igjen.
- `OPENAI_API_KEY` ligger bare på serveren.
- `POST /api/clips` krever `INGEST_TOKEN`. UI og server-funksjoner krever innlogging med Supabase Auth, og hver admin ser bare sine egne fasiliteter.
- `main.cpp` inkluderer fortsatt `wifi_gateway.h`. Kommer kortet på WiFi, speiles det det skriver til Atech-gatewayen, som ikke har innlogging. Fjern linjen hvis lyden bare skal gå over USB.
- Alle tabeller har RLS uten policyer, så de er stengt for Supabase sitt offentlige REST-API. Åpen registrering er slått av.
