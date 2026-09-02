import './app.css'
import './mcpbridge'
import './mind-foo-app'
import { initMcpConnect } from './mcp-connect'

document.getElementById('app')!.appendChild(document.createElement('mind-foo-app'))

// Auto-connects to a locally-running js-bridge-mcp server (see
// mcp-connect.ts) so an MCP client can attach without a human pasting an
// embed snippet into DevTools. mcpbridge.ts must have already set
// window.__mcpTools (imported above) before this runs.
initMcpConnect()
