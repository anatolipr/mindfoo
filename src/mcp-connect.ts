// Auto-connects mindfoo to a locally-running js-bridge-mcp server, so an MCP
// client can discover/call window.__mcpTools (set up by mcpbridge.ts)
// without a human pasting the embed snippet into DevTools. Modeled on
// bulletino-1's mcp-connect.mjs (see that file's own comment for the fuller
// design rationale) - trimmed down since mindfoo has no tool-bus/folderfoo
// file-tool layering, just its own mcpbridge.ts tools.
//
// Connection identity is a named CHANNEL, not a session-minted tenant UUID:
// js-bridge-mcp's channel support (mcp-tenant-lib 0.3.3+) makes a channel
// name the same string-keyed tenant id its main.js accepts via the `tenant`
// query param - so mindfoo can connect with a fixed, human-readable name
// (default "mindfoo") with zero interaction, and any MCP client can attach
// to the exact same live connection via join_channel("mindfoo").

import { Signal } from 'avosignals';

// js-bridge-mcp has no production deployment - it only ever runs locally,
// launched via `npx` (see ~/workspace2/avo-mcp-tools/packages/js-bridge-mcp),
// so this always targets localhost regardless of where mindfoo itself is
// served from.
const JSBRIDGE_HOST = 'http://localhost:8766';

const CHANNEL_STORAGE_KEY = 'mindfoo_mcp_channel';
const DEFAULT_CHANNEL = 'mindfoo';

function getStoredChannel(): string {
	try {
		return localStorage.getItem(CHANNEL_STORAGE_KEY) || DEFAULT_CHANNEL;
	} catch {
		return DEFAULT_CHANNEL;
	}
}

function setStoredChannel(name: string): void {
	try {
		localStorage.setItem(CHANNEL_STORAGE_KEY, name);
	} catch {
		// ignore - falls back to DEFAULT_CHANNEL next load
	}
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

// SignalWatcher-backed, same as $theme (data/theme.ts) - lets mind-foo-app.ts
// render the connect button's label reactively instead of needing its own
// listener wiring.
export const $mcpConnectionState: Signal<ConnectionState> = new Signal('disconnected');
export const $mcpChannel: Signal<string> = new Signal(getStoredChannel());

let currentChannel = getStoredChannel();

function setState(next: ConnectionState): void {
	$mcpConnectionState.set(next);
}

// Lightweight reachability probe via plain HTTP - js-bridge-mcp's main.js
// exposes no connect/disconnect events to the importer, so this is the only
// way to know "is js-bridge-mcp up" before (and independent of) actually
// importing main.js.
async function probeJsBridgeMcp(): Promise<boolean> {
	try {
		let res = await fetch(`${JSBRIDGE_HOST}/main.js`, { method: 'HEAD' });
		return res.ok;
	} catch {
		return false;
	}
}

async function connectToChannel(channelName: string): Promise<void> {
	setState('connecting');
	(window as any).__mcpAppName = channelName;
	currentChannel = channelName;
	setStoredChannel(channelName);
	$mcpChannel.set(channelName);

	let reachable = await probeJsBridgeMcp();
	if (!reachable) {
		setState('disconnected');
		return;
	}

	// A fresh import (unique URL per channel/tenant, since main.js reads
	// `tenant` once at module-eval time and exposes no way to retarget an
	// existing connection) - main.js has no export, so this is fire-and-
	// forget; connect/disconnect status past this point is inferred from the
	// probe above plus the module having loaded without throwing.
	await import(
		/* @vite-ignore */ `${JSBRIDGE_HOST}/main.js?server=${encodeURIComponent(JSBRIDGE_HOST)}&tenant=${encodeURIComponent(channelName)}&_=${Date.now()}`
	);
	setState('connected');
}

// Must match js-bridge-mcp's own isValidChannelName (mcp-tenant-lib/src/tenant.ts)
// exactly - channel names become the WS `?tenant=` query param, and the server
// rejects anything outside this set with a 4404 close before a Tenant is ever
// created.
const VALID_CHANNEL_NAME = /^[a-zA-Z0-9_-]+$/;

// Click behavior: connect (or reconnect) if not connected; if already
// connected, prompt to rename the channel.
export async function handleConnectClick(): Promise<void> {
	if ($mcpConnectionState.get() === 'connected') {
		let next = prompt('Name this connection (used to identify it to agents):', currentChannel);
		while (next && next !== currentChannel && !VALID_CHANNEL_NAME.test(next)) {
			next = prompt(
				`"${next}" isn't a valid channel name - only letters, digits, underscore, and hyphen are allowed (no spaces). Try again:`,
				next.replace(/[^a-zA-Z0-9_-]+/g, '-')
			);
		}
		if (!next || next === currentChannel) return;
		await connectToChannel(next);
		return;
	}
	await connectToChannel(currentChannel);
}

// Connects automatically on page load - no button click required. The
// Connect button (wired in mind-foo-app.ts) is only for reconnecting after a
// failed probe or renaming the channel.
export async function initMcpConnect(): Promise<void> {
	await connectToChannel(currentChannel);
}
