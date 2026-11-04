-- KeyForge bootstrapper
-- Thay FILE_ID bằng ID file trong tab Raw files.
-- Bootstrapper không làm source xuất hiện ở raw URL công khai; payload chỉ được cấp qua session 90 giây.

local HttpService = game:GetService("HttpService")
local FILE_ID = "PASTE_FILE_ID_HERE"
local API = "https://key-system-not7.onrender.com/api/v1/loader"

local function httpPost(path, body)
    local encoded = HttpService:JSONEncode(body)
    local request = (syn and syn.request) or (http and http.request) or request
    if not request then
        error("Executor không hỗ trợ HTTP request")
    end
    local response = request({
        Url = API .. path,
        Method = "POST",
        Headers = { ["Content-Type"] = "application/json" },
        Body = encoded,
    })
    local status = response.StatusCode or response.Status or 0
    local raw = response.Body or response.body or ""
    if status < 200 or status >= 300 then
        error("KeyForge loader error: HTTP " .. tostring(status))
    end
    return HttpService:JSONDecode(raw)
end

if FILE_ID == "PASTE_FILE_ID_HERE" then
    error("Hãy thay FILE_ID bằng ID file trong dashboard Raw files")
end

local clientId = "client-" .. tostring(game.PlaceId) .. "-" .. tostring(game.JobId ~= "" and game.JobId or os.time())
local session = httpPost("/session", { fileId = FILE_ID, clientId = clientId })
if session.ok ~= true or type(session.sessionToken) ~= "string" then
    error("KeyForge: file đang tắt hoặc session không hợp lệ")
end

local payload = httpPost("/payload", { sessionToken = session.sessionToken })
if payload.ok ~= true or type(payload.source) ~= "string" then
    error("KeyForge: không tải được payload")
end

local execute = (loadstring or load)
if type(execute) ~= "function" then
    error("Executor không hỗ trợ loadstring/load")
end

local chunk, compileError = execute(payload.source, "=KeyForgePayload")
if not chunk then error(compileError) end
return chunk()
