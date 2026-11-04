-- KeyForge packed bootstrapper
-- Thay FILE_ID bằng ID file trong dashboard Raw files.
-- Payload không được trả dưới dạng source plaintext qua HTTP; server trả packed-add-v1 theo session 90 giây.

local HttpService = game:GetService("HttpService")
local FILE_ID = "PASTE_FILE_ID_HERE"
local API = "https://key-system-not7.onrender.com/api/v1/loader"

local function httpPost(path, body)
    local requestFn = (syn and syn.request) or (http and http.request) or request
    if not requestFn then error("Executor không hỗ trợ HTTP request") end
    local response = requestFn({
        Url = API .. path,
        Method = "POST",
        Headers = { ["Content-Type"] = "application/json" },
        Body = HttpService:JSONEncode(body),
    })
    local status = response.StatusCode or response.Status or 0
    if status < 200 or status >= 300 then error("KeyForge loader error: HTTP " .. tostring(status)) end
    return HttpService:JSONDecode(response.Body or response.body or "")
end

local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local function decodeBase64(input)
    input = input:gsub("[^" .. B64 .. "=]", "")
    local bits = input:gsub(".", function(char)
        if char == "=" then return "" end
        local value = B64:find(char, 1, true) - 1
        local out = ""
        for i = 6, 1, -1 do out = out .. ((value % 2^i - value % 2^(i - 1) > 0) and "1" or "0") end
        return out
    end)
    local result = {}
    for byte in bits:gmatch("%d%d%d?%d?%d?%d?%d?%d?") do
        if #byte == 8 then
            local value = 0
            for i = 1, 8 do if byte:sub(i, i) == "1" then value = value + 2^(8 - i) end end
            result[#result + 1] = string.char(value)
        end
    end
    return table.concat(result)
end

local function unpackPayload(encoded, sessionToken)
    local packed = decodeBase64(encoded)
    local output = {}
    for i = 1, #packed do
        local keyByte = string.byte(sessionToken, ((i - 1) % #sessionToken) + 1)
        output[i] = string.char((string.byte(packed, i) - keyByte) % 256)
    end
    return table.concat(output)
end

if FILE_ID == "PASTE_FILE_ID_HERE" then error("Hãy thay FILE_ID bằng ID file trong dashboard Raw files") end
local clientId = "client-" .. tostring(game.PlaceId) .. "-" .. tostring(game.JobId ~= "" and game.JobId or os.time())
local session = httpPost("/session", { fileId = FILE_ID, clientId = clientId })
if session.ok ~= true or type(session.sessionToken) ~= "string" then error("KeyForge: file đang tắt hoặc session không hợp lệ") end

local payload = httpPost("/payload", { sessionToken = session.sessionToken })
if payload.ok ~= true or payload.algorithm ~= "packed-add-v1" or type(payload.payload) ~= "string" then error("KeyForge: không tải được payload") end
local scriptSource = unpackPayload(payload.payload, session.sessionToken)

local execute = loadstring or load
if type(execute) ~= "function" then error("Executor không hỗ trợ loadstring/load") end
local chunk, compileError = execute(scriptSource, "=KeyForgePayload")
if not chunk then error(compileError) end
return chunk()
