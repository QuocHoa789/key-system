-- Luau client protocol. Never embed HMAC_SECRET in an executor script.
local HttpService = game:GetService("HttpService")
local BASE_URL = "https://keys.example.com"
local CLIENT_ID = "script-hub-v1"
local function request(path, method, body)
    local payload = HttpService:JSONEncode(body or {})
    local response = request({Url = BASE_URL .. path, Method = method or "POST", Headers = { ["Content-Type"] = "application/json", ["X-Client-Id"] = CLIENT_ID }, Body = payload})
    return HttpService:JSONDecode(response.Body)
end
local hwid = (getgenv and getgenv().HWID) or "executor-provided-stable-hwid"
local gate = request("/api/gate/start", "POST", { hwid = hwid })
assert(gate.ok, gate.error or "Gate failed")
-- The server-side gate/loader integration must return a short-lived signed validation payload.
-- Do not ship HMAC_SECRET here; this sample intentionally stops before license validation.
print("Gate session:", gate.sessionId)
