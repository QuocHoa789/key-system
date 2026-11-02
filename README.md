# KeyForge — Key Management System

React / Express / tRPC / Drizzle starter, adapted from the Sandbox web-db-user template.

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm db:migrate`: apply checked-in migrations. `pnpm db:push`: generate and apply new schema changes.
- `pnpm check` / `pnpm test`: types and application tests.

Start with the Webdev skill's default-template guide. Platform login, storage, payments and service contracts live in its shared references; read the relevant capability before extending its helper.

`server/_core/publicConfig.ts` exposes only named public runtime values. Private keys stay server-side. The platform serves managed `/manus-storage/` assets; the application does not register a second proxy.

Platform configuration is readable and editable through `webdev.config`. Default settings are initial values, not enforced constraints. The agent may modify the files, commands and configuration or follow the flexible guide for another stack.
## Raw file hosting

Admin có thể mở tab **Raw files** trong dashboard để upload các file text/code (`txt`, `lua`, `js`, `ts`, `json`, `css`, `html`, `md`, `xml`, `yml`, `yaml`) tối đa 10 MB. Route upload yêu cầu session admin và trả về `rawPath` public dạng `/manus-storage/raw/...`; ghép với domain deploy để có raw URL dùng như GitHub Raw.

```http
POST /api/files/upload
Content-Type: text/plain
X-File-Name: loader.lua
```

Response mẫu:

```json
{"name":"loader.lua","size":1234,"contentType":"text/plain","rawPath":"/manus-storage/raw/loader_<hash>.lua"}
```

Server không nhận file thực thi hoặc phần mở rộng ngoài whitelist và không cho upload quá 10 MB.
