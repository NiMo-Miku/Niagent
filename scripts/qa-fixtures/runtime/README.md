# Local headed QA fixture

Run from the repository root:

```powershell
node scripts/headed-qa-fixture.mjs
```

The launcher copies the production app into `.qa-local/headed-20261011/app`, seeds only the isolated `data` directory, and prints the Electron launch command. `fixture.json` records the actual ports and paths. Subsequent launches retain ports, data and edited QA settings. Stop the QA Electron process before restarting the fixture. `--no-copy` retains the existing application copy.

The application UI, kernel, default OneBot client, tool execution, media reader, memory consolidation, session storage and usage archives are production implementations. OneBot/LLM/ASR responses, contacts, histories and media are explicitly synthetic local fixtures. No real QQ or model account is connected. The QA wrapper records OS autostart calls instead of registering them and rejects external Node HTTP/fetch. Production `electron/main.js` remains unchanged.

The stable headed fixture currently uses `http://127.0.0.1:31402` for mock services and `http://127.0.0.1:31403` for the console. Always prefer the URLs in `fixture.json` on a new machine.

| Endpoint | Purpose |
| --- | --- |
| `GET /qa/state` | Full synthetic model requests/responses, OneBot actions, emitted events, connections and paths |
| `POST /qa/emit` | Genuine WS OneBot message/notice; `kind` = group/private/image/video/record/forward/poke/recall/ban |
| `POST /qa/llm` | Set `mode` = normal/text/silent/error/slow, `delayMs`, optional `toolCall:{name,args}`; null clears tool override |
| `GET /v1/models` | Synthetic model catalogue |
| `POST /v1/chat/completions` | OpenAI compatible nonstreaming model with usage and tool calls |
| `POST /v1/audio/transcriptions` | Multipart synthetic ASR response with request size logged |
| `GET /media/qa.png` | Repository icon used as local image sample |
| `GET /media/qa.mp4` | Generated 1-second, 160×90 blue H.264 video |
| `GET /media/qa.wav` | Generated 1-second mono 16kHz PCM tone |

Example real OneBot trigger:

```powershell
Invoke-RestMethod http://127.0.0.1:31402/qa/emit -Method Post -ContentType application/json -Body '{"kind":"group","text":"QA: please reply"}'
Invoke-RestMethod http://127.0.0.1:31402/qa/llm -Method Post -ContentType application/json -Body '{"mode":"slow","delayMs":15000}'
Invoke-RestMethod http://127.0.0.1:31402/qa/emit -Method Post -ContentType application/json -Body '{"kind":"image","groupId":10002,"text":"QA: inspect local image"}'
Invoke-RestMethod http://127.0.0.1:31402/qa/llm -Method Post -ContentType application/json -Body '{"mode":"normal","toolCall":{"name":"memory_query","args":{"userId":"20001"}}}'
Invoke-RestMethod http://127.0.0.1:31402/qa/llm -Method Post -ContentType application/json -Body '{"mode":"normal","toolCall":null}'
```

`at:false` emits ordinary speech. Default group is 10001, sender 20001, bot 900001. Private chats use `kind:private`. `message` or `event` can supply a full synthetic OneBot structure. Responses and actions also persist to `state.json`; desktop adapter events persist to `desktop-adapter.jsonl`.

Initial data contains three chats, seven sessions spanning current and historical usage ranges, real impression files, one local sticker, and a future reminder. Cloud market/community/telemetry are initially disabled. Extension ZIP/MCP fixtures live in `../extensions/prepare.mjs` and the generated `extension-fixtures/HEADED-STEPS.txt`; they are installed through the UI during QA.

Model catalogue/vision probes and the default ASR public HTTP gateway may reject localhost under production SSRF policy. Treat that as an observed production failure branch; this fixture does not override their validation. A direct fixture response demonstrates server readiness, not successful production consumption. Pure-text model responses are likewise distinct from actual tool sends.

Independent behavior check:

```powershell
node test/91-headed-qa-fixture-test.mjs
```

This creates and removes a separate temporary QA copy. It exercises real default WS→ingest→LLM→tools→HTTP send→session/day archive, silent replies, cancellation, binary media, memory facts and console authentication. It does not open or control the headed window.

For selective copy updates:

```javascript
import { syncHeadedQaApplication } from './scripts/headed-qa-fixture.mjs';
syncHeadedQaApplication({ files: ['ui/panels/settings/panel.js'] });
```

Refresh UI assets after sync; restart Electron to load kernel, plugin or main-process changes. Do not reuse this isolated directory for real accounts.
