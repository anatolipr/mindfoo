// MCP bridge for mindfoo (aka "arrows"), following the same window.__mcpTools /
// window.__mcpSummary contract as js-bridge-mcp
// (see /Users/anatoli/Downloads/mcp-form-demo/packages/js-bridge-mcp) and the
// htmlpaint.com bridge this file is modeled after
// (/Users/anatoli/workspace2/htmlpaint.com/src/mcpbridge.js).
//
// Unlike those two examples, this file is imported directly from main.ts
// rather than pasted into DevTools - window.__mcpTools/__mcpSummary are
// always defined as soon as the app boots. An external js-bridge-mcp-style
// server still has to inject its own embed-snippet connector script
// (imported dynamically, e.g. via get_embed_snippet) for a real MCP client
// to actually discover and call these; this file only sets up the page side
// of the contract.
import {
	$nodes as nodes,
	$links as links,
	$selection as selection,
	$selectedLink as selectedLink,
	$scene as scene,
	rotateArrows,
	rotateLineDash,
	rotateLineWidth,
	rotateNodeType,
	rotateNodeSize,
	equalSpacing,
	mirror,
	alignLast,
	center,
	colorChange,
	makeNodesMap,
	makeLines,
	resize,
	tick,
} from './data/store';
import { $theme as theme, toggleTheme } from './data/theme';
import type { Link, Node, NodeId } from './data/types';
import { UNSELECTED, DEFAULT_NODE_FONT_SIZE, DEFAULT_NODE_TYPE, DEFAULT_WIDTH, DEFAULT_DASH } from './data/types';
import { nanoid } from 'nanoid';
import { assertValidNodes, assertValidLinks } from './data/dataSchema';

// ---------------------------------------------------------------------
// Shared agent-facing context, lazily loadable via the app_description tool.
//
// This used to be one large MOCK_WORKFLOW_NOTE + __mcpSummary blob prepended
// in full to EVERY tool's `description` below - meaning an MCP client paid
// for the entire block once per tool in its primer/manifest, even though
// most of it (the exact node/link shape reference, sizing gotchas, etc.) is
// only relevant to a handful of tool calls in a given session.
//
// It is now split into named sections (DESCRIPTION_SECTIONS below), mirroring
// htmlpaint.com's mcpbridge.js (see that file's own comment for the fuller
// rationale). Per-tool `description` strings only keep what's genuinely
// tool-specific, plus short pointers like "see app_description('node-shape')"
// instead of the full text. window.__mcpSummary is still a single joined
// string (all sections' `text`, in order, under "## TITLE" headings) for
// backward compatibility with existing external tooling - built FROM this
// array, not maintained separately, so the two can't drift.
// ---------------------------------------------------------------------

type DescriptionSection = {topic: string; title: string; blurb: string; text: string};

const DESCRIPTION_SECTIONS: DescriptionSection[] = [
	{
		topic: 'workflow',
		title: 'WORKFLOW',
		blurb: 'What mindfoo is, tool choice (whole-document vs single-node/link), and gotcha overview.',
		text:
			'Context: mindfoo (aka "arrows") is a freeform visual mind-mapping / diagramming tool. A diagram ' +
			'is "nodes" (shapes: roundrect/rect/circle/ellipse/rhombus/parallelogram, holding text/color/font ' +
			'size, positioned by an x/y CENTER point, not top-left) PLUS "links" (curved connector lines ' +
			'between two node ids, each independently stylable as a plain line or an arrow). get_document/' +
			'set_document read/write the WHOLE tree (nodes + links together) and are for structural changes - ' +
			'building a new diagram, adding/removing nodes or links. For a small edit to ONE node that already ' +
			'exists (recolor it, change its text, nudge x/y, resize via minWidth/maxWidth) use get_node/' +
			'patch_node instead - they address a single node by "id" and are far cheaper than resending the ' +
			'whole document for a one-field change; never call set_document just to change one field on one ' +
			'existing node. There is still no per-link update tool - a link change requires set_document with ' +
			'the complete links array. ' +
			'See app_description("node-shape") for the exact node field reference and sizing gotchas, and ' +
			'app_description("link-shape") for the exact link field reference and its own gotchas. ' +
			'PERSISTENCE: there is no server-side persistence - the document lives only in memory until a ' +
			'human explicitly exports it to a .arrows file; get_document/set_document mirror that same ' +
			'{nodes, links} shape. ' +
			'If you have not already called app_description on this connection, call it with no topic first - ' +
			'it returns the index of available sections, which are not repeated in every individual tool ' +
			'description.',
	},
	{
		topic: 'node-shape',
		title: 'EXACT NODE SHAPE',
		blurb: 'Node field reference, plus the x/y-is-center and width/height-is-read-only sizing gotchas.',
		text:
			'EXACT NODE SHAPE: {"id": string|number, unique, referenced by links - keep an existing node\'s ' +
			'id unchanged, "x"/"y": numbers, CENTER in canvas coordinates (canvas panning is a separate scene ' +
			'offset, see get_scene/set_scene), "width"/"height": read-only, DO NOT SET - a DOM-measurement ' +
			'cache that set_document ignores on input and always recomputes after render; do not echo back ' +
			'values read from get_document, "minWidth": number, 0 = no minimum, the only floor size you may ' +
			'request, "maxWidth": number, default 300, the ceiling before text wraps instead of widening the ' +
			'node (same value a human sets by dragging the node\'s right edge) - height is never settable, not ' +
			'even as a floor: it is always the pure result of wrapping ' +
			'the node\'s text at its (auto, minWidth-floored, or maxWidth-capped) width, exactly like a human ' +
			'editing the node gets, "color": CSS color string or "" for theme ' +
			'default, "text": inner HTML shown in the node (plain text is always safe), "size": one of ' +
			'"15px"|"20px"|"25px"|"30px", "type": 0=roundrect, 1=rect, 2=circle, 3=ellipse, 4=rhombus, ' +
			'5=parallelogram - use rotate_node_type on a selection to cycle these rather than hand-guessing ' +
			'the int. ' +
			'GOTCHA: node "x"/"y" are the CENTER, not top-left, and "width"/"height" are a read-only DOM-' +
			'measurement cache - set_document ignores any "width"/"height" you pass and always starts new/' +
			'replaced nodes at the same placeholder size, which is then corrected by the live measurement pass ' +
			'right after render, the same auto-sizing-to-content (incl. text wrapping) a human editing the node ' +
			'gets. Width has a floor you may set via "minWidth" and a ceiling via "maxWidth" (default 300), ' +
			'since a human can also drag a node\'s right edge to change its ceiling by hand - text longer than ' +
			'"maxWidth" wraps instead of growing the node wider; height has NO such floor and is never yours ' +
			'to decide - it always falls out purely from wrapping ' +
			'the text at the node\'s width, so "minHeight" is not accepted and is always forced to 0/auto. If a ' +
			'node reads too short or too tall, that is a text-length/minWidth problem, not a height problem - ' +
			'wider (bigger minWidth) means shorter, narrower means taller; never try to fix it by requesting a ' +
			'height.',
	},
	{
		topic: 'link-shape',
		title: 'EXACT LINK SHAPE',
		blurb: 'Link field reference, plus the id-not-index, default-direction/color, and left/right-flip gotchas.',
		text:
			'EXACT LINK SHAPE: {"one": NodeId, "two": NodeId - the connected nodes\' ids, order does ' +
			'not imply direction, "direction": "none"|"left"|"right"|"both" - which end(s) get an arrowhead; ' +
			'"left"/"right" mean whichever node currently renders further left/right on screen, NOT "one" vs ' +
			'"two", so the arrow can visually flip if a node\'s x later moves it past the other node - prefer ' +
			'"both"/"none" if a stable "points at node X" meaning matters more than screen side, "dash": ""|' +
			'"4" (solid/dashed), "width": 2|4|6 (stroke px), "color": CSS color or undefined for theme ' +
			'default, "text": optional label following the curve. Nodes/links are flat top-level arrays, not ' +
			'nested - connectivity is expressed purely by node x/y plus link one/two, there is no parent/ ' +
			'child scene graph. ' +
			'GOTCHAS: (1) links reference nodes by "id" (never array index, which is incidental) - a link ' +
			'whose "one"/"two" does not match a node "id" in the same set_document call is silently ' +
			'unrenderable, so always include both endpoint nodes and the link together. (2) a link with no ' +
			'explicit "direction" defaults to "none" (a plain unarrowed line) and no explicit "color" ' +
			'defaults to the theme color, not to either endpoint node\'s color - do not assume a new link ' +
			'auto-picks up interesting styling.',
	},
	{
		topic: 'transient',
		title: 'RUN_TRANSIENT (one-off computations)',
		blurb: 'When to reach for run_transient instead of computing an aggregate over node/link data yourself.',
		text:
			'RUN_TRANSIENT: for an aggregate or nontrivial reduction over MANY nodes/links (e.g. "how many ' +
			'nodes are circles", "average x position of selected nodes", "list every link with no direction ' +
			'set") call run_transient instead of computing it yourself by reading get_document and doing the ' +
			'arithmetic/filtering in-context - that gets unreliable as the diagram grows, producing a ' +
			'plausible-looking wrong answer with no error signal, whereas real JS run against the live data ' +
			'is deterministic. Do NOT use it for anything the other tools already do (reading/writing nodes, ' +
			'links, selection) and do not reach for it on a handful of items you could just read directly - ' +
			'reserve it for "many items, nontrivial reduction". CALLING CONTRACT: "code" is a JS function BODY, ' +
			'not a full function declaration (do not wrap it in "function(){...}"). It receives ' +
			'(args, document, window) and whatever it RETURNS becomes the result (a bare expression without ' +
			'"return" produces no result). It is compiled and run once for this call only, then discarded - it ' +
			'is NOT persisted anywhere and does NOT become a new registered tool. It is still full code ' +
			'execution in the page\'s own origin, same as any other browser devtools console statement - ' +
			'session-scoping bounds persistence, not capability.',
	},
];

const APP_BLURB =
	'mindfoo (aka "arrows") is a freeform visual mind-mapping/diagramming tool: nodes are shapes ' +
	'positioned by their CENTER, links are connector lines between two node ids - call app_description() ' +
	'(no args) for the topic index before writing/reading nodes or links, especially before touching ' +
	'sizing (width/height are read-only) or link direction/color defaults.';

/** @type {any} */ (window as any).__mcpSummary = DESCRIPTION_SECTIONS
	.map((s) => `## ${s.title}\n${s.text}`)
	.join('\n\n');

function describeApp({topic}: {topic?: string} = {}): string {
	if (!topic) {
		return JSON.stringify({
			blurb: APP_BLURB,
			topics: DESCRIPTION_SECTIONS.map((s) => ({topic: s.topic, title: s.title, blurb: s.blurb})),
		});
	}
	let section = DESCRIPTION_SECTIONS.find((s) => s.topic === topic);
	if (!section) {
		let names = DESCRIPTION_SECTIONS.map((s) => s.topic).join(', ');
		throw new Error(`no app_description topic named "${topic}" - available topics: ${names}`);
	}
	return JSON.stringify({topic: section.topic, title: section.title, text: section.text});
}

// Kept as a short alias so any per-tool description that still wants one
// inline sentence of framing doesn't need the full workflow section text.
const MOCK_WORKFLOW_NOTE = APP_BLURB;

// Compiles and immediately runs "code" as a JS function body for THIS call
// only, then discards it - see app_description("transient") for the full
// contract/rationale, and js-bridge-mcp's run_transient pilot
// (legacy-page/hello-world.html) / bulletino's mcpbridge.mjs for the
// reference implementation this mirrors.
function runTransient({code, args}: {code: string; args?: string}): string {
	let parsedArgs: unknown;
	try {
		parsedArgs = typeof args === 'string' && args ? JSON.parse(args) : undefined;
	} catch (e) {
		throw new Error(`args must be a JSON string (or omitted) - failed to parse: ${(e as Error).message}`);
	}
	// eslint-disable-next-line no-new-func -- deliberate, see app_description("transient")
	const fn = new Function('args', 'document', 'window', code);
	const result = fn(parsedArgs, document, window);
	return typeof result === 'string' ? result : JSON.stringify(result);
}

function readDocument(): string {
	return JSON.stringify({ nodes: nodes.get(), links: links.get() });
}

function readSelection(): string {
	let sel = selection.get();
	let selLink = selectedLink.get();
	let allNodes = nodes.get();
	let allLinks = links.get();
	return JSON.stringify({
		selectedNodes: sel.map((i) => allNodes[i]).filter(Boolean),
		selectedNodeIndices: sel,
		selectedLink: selLink !== UNSELECTED ? allLinks[selLink] : null,
	});
}

function findNodeIndex(allNodes: Node[], id: NodeId): number {
	return allNodes.findIndex((n) => n.id === id);
}

// Reads back a SINGLE node by id instead of the whole document - lets an
// agent that already has get_document's output in context re-check or
// re-fetch just the one node it's about to patch, without paying for
// nodes+links again.
function getNode({ id }: { id: string }): string {
	let idx = findNodeIndex(nodes.get(), id);
	if (idx === -1) throw new Error(`no node with id "${id}" - call get_document for current ids`);
	return JSON.stringify(nodes.get()[idx]);
}

// Surgical single-node update: merges the given fields into the node with
// the given id instead of requiring the agent to resend the ENTIRE
// {nodes, links} document (via set_document) for a small change like
// recoloring one node or fixing a typo in its text. Shallow merge only -
// "id" cannot be changed (links reference it) and "width"/"height" cannot
// be set directly (see fillNodeDefaults' comment - they're a DOM-
// measurement cache), same restriction set_document already applies via
// fillNodeDefaults dropping them.
async function patchNode({ id, fieldsJson }: { id: string; fieldsJson: string }): Promise<string> {
	let fields: Partial<Node> = JSON.parse(fieldsJson);
	if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
		throw new Error('fieldsJson must be a JSON object of {fieldName: newValue} pairs to merge, e.g. {"color":"#3498db"}');
	}
	if ('id' in fields) {
		throw new Error('patch_node cannot change "id" - links reference it by id; if you need a ' +
			'differently-identified node, create a new one via set_document instead');
	}
	if ('width' in fields || 'height' in fields) {
		throw new Error('patch_node cannot set "width"/"height" directly - they are a read-only DOM-' +
			'measurement cache recomputed after render, exactly like set_document ignores them on input; ' +
			'use "minWidth"/"maxWidth" to influence size instead (see EXACT NODE SHAPE above)');
	}

	let allNodes = nodes.get();
	let idx = findNodeIndex(allNodes, id);
	if (idx === -1) throw new Error(`no node with id "${id}" - call get_document for current ids`);

	let merged = { ...allNodes[idx], ...fields };
	// assertValidNodes checks against the AGENT-INPUT schema (dataSchema.ts),
	// which deliberately excludes "width"/"height"/"minHeight" - they're a
	// live DOM-measurement cache that's always present on an existing node
	// but never valid as agent-authored input (see fillNodeDefaults' comment
	// in setDocument). Validating `merged` directly would reject every
	// patch_node call, on every node, regardless of what fields were
	// actually passed in, since those cache fields ride along from
	// allNodes[idx] above. Validate a copy with them stripped instead; they
	// aren't touched by this function (blocked above) so they carry over
	// into the written node unchanged either way.
	let { width, height, minHeight, ...toValidate } = merged;
	assertValidNodes([toValidate]);
	allNodes[idx] = merged;
	nodes.set(allNodes);
	makeNodesMap(allNodes);

	// Only "x"/"y" (position) affect link curve endpoints - other fields
	// (color/text/size/type/minWidth/maxWidth) can change the node's
	// measured width/height too (text length, font size), so always
	// re-measure via resize() the same way set_document does for every
	// node, then recompute lines - cheap for a single node, unlike
	// set_document's full-document pass.
	await tick();
	resize(idx, true);

	return JSON.stringify(merged);
}

function findLinkIndex(allLinks: Link[], one: NodeId, two: NodeId): number {
	return allLinks.findIndex(
		(l) => (l.one === one && l.two === two) || (l.one === two && l.two === one)
	);
}

function writeSelection({ nodeIds }: { nodeIds: string }): string {
	let ids: NodeId[] = JSON.parse(nodeIds);
	if (!Array.isArray(ids)) throw new Error('nodeIds must be a JSON array of node id strings');
	let allNodes = nodes.get();
	let indices = ids
		.map((id) => findNodeIndex(allNodes, id))
		.filter((i) => i > -1);
	selection.set(indices);
	selectedLink.set(UNSELECTED);
	return `selected ${indices.length} of ${ids.length} requested node id(s)`;
}

function getScene(): string {
	return JSON.stringify(scene.get());
}

function setScene({ x, y }: { x: number; y: number }): string {
	scene.set({ x, y });
	return `scene panned to (${x}, ${y})`;
}

function getTheme(): string {
	return theme.get();
}

function setTheme({ theme: t }: { theme: string }): string {
	if (t !== 'dark' && t !== 'light') throw new Error('theme must be "dark" or "light"');
	if (theme.get() !== t) toggleTheme();
	return `theme set to ${t}`;
}

// Fills in fields an agent commonly omits when hand-authoring a node object,
// matching the defaults the UI itself uses when a human creates a node (see
// add() in data/store.ts) - an agent-authored node array skips that
// function entirely (no DOM measurement pass), so this is the only place
// those defaults get applied for bridge-authored nodes.
//
// "width"/"height" are intentionally NOT accepted from the agent-supplied
// node here, even if present on the input: they are purely a cache of a
// live DOM measurement (see mind-foo-app.ts's ResizeObserver-backed
// observeNodeSize()), never used to set the rendered box's actual CSS size
// (that's driven by content + minWidth, wrapped exactly like a human typing
// into the node would), and get overwritten by the ResizeObserver-driven
// measurement pass on next render regardless. An agent echoing back a stale measured
// value from an earlier get_document (rather than the generic 140/140
// default) made some bridge-authored nodes look inconsistently sized next
// to freshly-created ones - always start every bridge-authored node from
// the same 140/140 placeholder so they behave identically until measured.
//
// "minHeight" is likewise never accepted from the agent, even though the
// Node type/UI technically support it (mind-foo-app.ts does render it as CSS
// min-height) - it is always forced to 0 here. Height must stay something
// only text-wrap + width ever decides, the same as when a human edits a
// node; agents that want a node "bigger" should ask for a bigger minWidth
// (which reflows the wrapped text and changes height as a side effect),
// never a height/minHeight directly.
function fillNodeDefaults(n: Partial<Node>): Node {
	return {
		id: n.id ?? nanoid(5),
		x: n.x ?? 0,
		y: n.y ?? 0,
		width: 140,
		height: 140,
		minWidth: n.minWidth ?? 0,
		maxWidth: n.maxWidth ?? 300,
		minHeight: 0,
		color: n.color ?? '',
		text: n.text ?? '',
		size: n.size ?? DEFAULT_NODE_FONT_SIZE,
		type: n.type ?? DEFAULT_NODE_TYPE,
	};
}

function fillLinkDefaults(l: Partial<Link>): Link {
	if (l.one === undefined || l.two === undefined) {
		throw new Error('every link needs "one" and "two" node ids');
	}
	return {
		one: l.one,
		two: l.two,
		direction: l.direction ?? 'none',
		dash: l.dash ?? DEFAULT_DASH,
		width: l.width ?? DEFAULT_WIDTH,
		color: l.color,
		text: l.text,
	};
}

async function setDocument({ documentJson }: { documentJson: string }): Promise<string> {
	let parsed: { nodes: Partial<Node>[]; links: Partial<Link>[] } = JSON.parse(documentJson);
	if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) {
		throw new Error('documentJson must be shaped like {"nodes": [...], "links": [...]} - the COMPLETE new tree, not a delta');
	}
	assertValidNodes(parsed.nodes);
	assertValidLinks(parsed.links);
	let filledNodes = parsed.nodes.map(fillNodeDefaults);
	let ids = new Set(filledNodes.map((n) => n.id));
	for (let l of parsed.links) {
		if (l.one === undefined || !ids.has(l.one)) throw new Error(`link references node id "${l.one}" not present in the "nodes" array`);
		if (l.two === undefined || !ids.has(l.two)) throw new Error(`link references node id "${l.two}" not present in the "nodes" array`);
	}
	let filledLinks = parsed.links.map(fillLinkDefaults);
	nodes.set(filledNodes);
	links.set(filledLinks);
	makeNodesMap(filledNodes);
	selection.set([]);
	selectedLink.set(UNSELECTED);
	// Every node above was just (re)written at the fillNodeDefaults 140/140
	// placeholder size, not its real measured box size - same starting point
	// add() uses for a freshly-created node. Line endpoints are trimmed to
	// each node's shape outline (see makeShape() in makeLines()), keyed off
	// node.width/height, so calling makeLines() immediately here would trim
	// curves against the placeholder box instead of the real rendered one
	// (visibly wrong for any node whose real size differs from 140x140,
	// which is most of them). Mirror add()'s pattern instead: wait for the
	// view to render the placeholder-sized boxes (tick()), measure every
	// node's real box via resize() same as a user's drag/add does, THEN
	// compute lines against the corrected sizes - the same
	// dragged-node-recalculates-line-endpoints behavior the UI gives a
	// human, just applied to every node in the replaced document instead of
	// just the one being dragged.
	await tick();
	let nodeCount = nodes.get().length;
	for (let i = 0; i < nodeCount; i++) {
		resize(i);
	}
	makeLines();
	// resize() (and the app's own ResizeObserver-driven auto-sizing) mutate
	// each node's width/height IN PLACE on the array already held by the
	// $nodes Signal, without calling Signal#set() - so nothing has actually
	// re-published to $nodes' subscribers yet, even though the underlying
	// data is now correct. The interactive add() path (see store.ts) never
	// hits this because it always follows up with $nodes.update(...), which
	// republishes the WHOLE list and makes the view's node repeat() block
	// rerun makeShape(node) for every node - that republish, not the
	// measurement itself, is what actually repaints the SVG shapes at their
	// correct size. Skipping this call is exactly what made bridge-authored
	// diagrams render with stale/placeholder-ish shapes until some unrelated
	// interaction (e.g. adding a node) finally triggered a real $nodes
	// publish and repainted everything at once.
	nodes.set(nodes.get());
	return `document replaced (${filledNodes.length} nodes, ${filledLinks.length} links)`;
}

function requireSelection(min: number = 1): number[] {
	let sel = selection.get();
	if (sel.length < min) {
		throw new Error(`this operation needs at least ${min} selected node(s) - call set_selection first`);
	}
	return sel;
}

function rotateNodeTypeTool(): string {
	requireSelection(1);
	rotateNodeType();
	return JSON.stringify(selection.get().map((i) => nodes.get()[i]));
}

function rotateNodeSizeTool(): string {
	requireSelection(1);
	rotateNodeSize();
	return JSON.stringify(selection.get().map((i) => nodes.get()[i]));
}

function requireSelectedLink(): number {
	let i = selectedLink.get();
	if (i === UNSELECTED) throw new Error('no link selected - call set_selected_link with its endpoint ids first');
	return i;
}

function setSelectedLink({ one, two }: { one: string; two: string }): string {
	let allLinks = links.get();
	let idx = findLinkIndex(allLinks, one, two);
	if (idx === -1) throw new Error(`no link between "${one}" and "${two}"`);
	selection.set([]);
	selectedLink.set(idx);
	return JSON.stringify(allLinks[idx]);
}

function rotateLinkDirection(): string {
	let idx = requireSelectedLink();
	rotateArrows();
	return JSON.stringify(links.get()[idx]);
}

function rotateLinkDashTool(): string {
	let idx = requireSelectedLink();
	rotateLineDash();
	return JSON.stringify(links.get()[idx]);
}

function rotateLinkWidthTool(): string {
	let idx = requireSelectedLink();
	rotateLineWidth();
	return JSON.stringify(links.get()[idx]);
}

function alignNodes({ axis }: { axis: 'x' | 'y' }): string {
	requireSelection(2);
	if (axis === 'x') {
		alignLast('x', 'width');
	} else {
		alignLast('y', 'height');
	}
	return JSON.stringify(selection.get().map((i) => nodes.get()[i]));
}

function centerNodesTool({ axis }: { axis: 'x' | 'y' }): string {
	requireSelection(2);
	center(axis, axis === 'x' ? 'width' : 'height');
	return JSON.stringify(selection.get().map((i) => nodes.get()[i]));
}

function equalSpacingTool({ axis }: { axis: 'x' | 'y' }): string {
	requireSelection(3);
	equalSpacing(axis, axis === 'x' ? 'width' : 'height');
	return JSON.stringify(selection.get().map((i) => nodes.get()[i]));
}

function mirrorNodesTool({ axis }: { axis: 'x' | 'y' }): string {
	requireSelection(2);
	mirror(axis, axis === 'x' ? 'width' : 'height');
	return JSON.stringify(selection.get().map((i) => nodes.get()[i]));
}

function setNodeColor({ color }: { color: string }): string {
	let fakeEvent = { detail: hexToRgba(color) } as CustomEvent;
	colorChange(fakeEvent);
	return `color applied to current selection (${color})`;
}

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
	let h = hex.replace('#', '');
	if (h.length === 3) h = h.split('').map((c) => c + c).join('');
	let r = parseInt(h.substring(0, 2), 16);
	let g = parseInt(h.substring(2, 4), 16);
	let b = parseInt(h.substring(4, 6), 16);
	let a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1;
	if ([r, g, b].some((v) => Number.isNaN(v))) throw new Error(`"${hex}" is not a valid hex color like "#3498db"`);
	return { r, g, b, a };
}

(window as any).__mcpTools = [
	{
		name: 'get_document',
		description: `${MOCK_WORKFLOW_NOTE} Returns the WHOLE diagram as {"nodes":[...], "links":[...]} ` +
			'- the single read tool for the tree, covering nodes and links together (same shape a human ' +
			'gets from "export" in the UI, minus the file-save step, and the same shape set_document ' +
			'expects back). Call this once to see current state before planning any change. ' +
			'PREFER get_node OVER THIS when you already know a specific node id (e.g. still in context from ' +
			'an earlier get_document, or from get_selection) and just want to re-check its current fields.',
		params: {},
		fn: readDocument,
	},
	{
		name: 'get_node',
		description: `${MOCK_WORKFLOW_NOTE} Returns a SINGLE node by "id", in the same shape get_document's ` +
			'"nodes" array uses. Use instead of get_document when you already know which one node you want ' +
			'to inspect - e.g. right before patch_node, to confirm current values without re-fetching the ' +
			'whole {nodes, links} document. Throws if no node has that id (call get_document for current ids).',
		params: { id: { type: 'string', description: 'The node\'s id' } },
		example: { id: 'a1' },
		fn: getNode,
	},
	{
		name: 'patch_node',
		description: `${MOCK_WORKFLOW_NOTE} SURGICAL SINGLE-NODE UPDATE - PREFER THIS over set_document for ` +
			'a small, targeted edit to a node that already exists (recolor it, change its text, nudge its ' +
			'x/y, change minWidth/maxWidth/size/type). Merges only the fields you pass (e.g. ' +
			'{"color":"#3498db"}) into the existing node with the given id - fields you omit are left ' +
			'untouched. Cannot change "id" (links reference it - create a new node via set_document if you ' +
			'need one) or set "width"/"height" directly (same read-only DOM-measurement-cache restriction ' +
			'set_document applies - use "minWidth"/"maxWidth" instead). Much cheaper than get_document + ' +
			'hand-edit + set_document: you never need to hold or resend the WHOLE {nodes, links} document ' +
			'(including every other node and every link) just to change one field on one node, and it ' +
			'cannot accidentally drop/corrupt an unrelated node or link. Resolves only once the patched ' +
			'node has been re-measured and any connected links\' curves recomputed against its real ' +
			'rendered size/position (same as set_document, just scoped to the one node), so ' +
			'get_document/get_node will report accurate width/height immediately after this returns.',
		params: {
			id: { type: 'string', description: 'The node\'s id' },
			fieldsJson: { type: 'string', description: 'JSON object of {fieldName: newValue} pairs to merge into the node, e.g. {"color":"#3498db"}' },
		},
		example: { id: 'a1', fieldsJson: '{"color":"#3498db"}' },
		fn: patchNode,
	},
	{
		name: 'set_document',
		description: `${MOCK_WORKFLOW_NOTE} Replaces the WHOLE diagram from a {"nodes":[...],"links":[...]} ` +
			'JSON string - a full replace, not a merge or delta, so pass the COMPLETE set of nodes and ' +
			'links you want to exist afterward. Use this for STRUCTURAL changes (add/remove nodes or links, ' +
			'build a new diagram from scratch); IF YOU ARE ONLY CHANGING A FEW FIELDS ON A NODE THAT ALREADY ' +
			'EXISTS, use patch_node INSTEAD - it is cheaper and cannot disturb unrelated nodes/links. ' +
			'Clears the current selection. Every link\'s "one"/"two" ' +
			'must reference a node id present in the same "nodes" array you are passing, or this throws. ' +
			'Missing fields are filled with sane defaults: nodes get x/y:0, color:"", text:"", size:"15px", ' +
			'type:0/roundrect, minWidth:0, maxWidth:300, and a freshly generated id if omitted - so you only ' +
			'need to specify what you actually care about (typically a node\'s text/x/y and a link\'s ' +
			'one/two/direction). Any "width"/"height"/"minHeight" you pass on a node is ignored (not an ' +
			'error, just a no-op, minHeight is always forced to 0) - every node always starts at the same ' +
			'placeholder size and is corrected by the live DOM-measurement pass right after render, sizing ' +
			'to content exactly like a human editing the node would; use "minWidth" if you need a floor ' +
			'size - there is no floor for height, it is purely a function of text length wrapped at the ' +
			'node\'s width, so never try to make a node "taller" directly. ' +
			'links get direction:"none", dash:"", width:2. Resolves only once every node has been measured ' +
			'and every link\'s curve has been recomputed against each node\'s real rendered shape/size (same ' +
			'endpoint recalculation a human dragging a node triggers) - so by the time this call returns, ' +
			'lines are already trimmed correctly and get_document will report accurate width/height, with ' +
			'no separate step needed.',
		params: { documentJson: { type: 'string', description: 'JSON-encoded {"nodes":[...],"links":[...]} - the COMPLETE new tree, see EXACT NODE/LINK SHAPE above' } },
		example: { documentJson: '{"nodes":[{"id":"a1","text":"Root","x":0,"y":0},{"id":"a2","text":"Child","x":200,"y":0}],"links":[{"one":"a1","two":"a2","direction":"right"}]}' },
		fn: setDocument,
	},
	{
		name: 'get_selection',
		description: `${MOCK_WORKFLOW_NOTE} Returns whichever node(s) or link the human currently has ` +
			'selected/highlighted in the UI, as {selectedNodes, selectedNodeIndices, selectedLink}. ' +
			'selectedNodes/selectedLink are full node/link objects (or selectedLink:null if none); ' +
			'selectedNodeIndices is their position in get_document\'s "nodes" array at read time (NOT a ' +
			'stable id - use the node objects\' own "id" field for anything durable). Node and link ' +
			'selection are mutually exclusive in this app. Use this so a human can point at exactly which ' +
			'node(s)/link they mean by selecting them in the UI first, instead of you guessing from ' +
			'get_document which ones they intend, and so you can answer questions about "the selected ' +
			'node(s)" without re-reading the whole tree.',
		params: {},
		fn: readSelection,
	},
	{
		name: 'set_selection',
		description: `${MOCK_WORKFLOW_NOTE} Selects the given node ids (replacing any current selection, ` +
			'and clearing any selected link) - required before calling rotate_node_type/rotate_node_size/ ' +
			'align_nodes/center_nodes/equal_spacing_nodes/mirror_nodes/set_node_color, which all act on "the ' +
			'current selection" the same way keyboard shortcuts in the UI do. Unknown ids are silently ' +
			'skipped; the result message reports how many of the requested ids were actually found/selected.',
		params: { nodeIds: { type: 'string', description: 'JSON-encoded array of node id strings to select' } },
		example: { nodeIds: '["abc12","def34"]' },
		fn: writeSelection,
	},
	{
		name: 'set_selected_link',
		description: `${MOCK_WORKFLOW_NOTE} Selects the link between the two given node ids (clearing any ` +
			'node selection) - required before calling rotate_link_direction/rotate_link_dash/' +
			'rotate_link_width, which act on "the currently selected link" the same way keyboard shortcuts do.',
		params: {
			one: { type: 'string', description: 'One endpoint node id' },
			two: { type: 'string', description: 'The other endpoint node id' },
		},
		example: { one: 'abc12', two: 'def34' },
		fn: setSelectedLink,
	},
	{
		name: 'rotate_node_type',
		description: `${MOCK_WORKFLOW_NOTE} Cycles every currently-selected node\'s shape "type" to the ` +
			'next value in order [roundrect(0), rect(1), circle(2), ellipse(3), rhombus(4), parallelogram(5)], ' +
			'wrapping back to roundrect after parallelogram - same as pressing Space with nodes selected in ' +
			'the UI. Call set_selection first. Prefer this over guessing/writing a raw "type" int via ' +
			'set_document since it matches the exact cycle order the UI itself uses.',
		params: {},
		fn: rotateNodeTypeTool,
	},
	{
		name: 'rotate_node_size',
		description: `${MOCK_WORKFLOW_NOTE} Cycles every currently-selected node\'s font "size" to the next ` +
			'value in ["15px","20px","25px","30px"], wrapping around - same as pressing "]" with nodes ' +
			'selected in the UI. Call set_selection first.',
		params: {},
		fn: rotateNodeSizeTool,
	},
	{
		name: 'rotate_link_direction',
		description: `${MOCK_WORKFLOW_NOTE} Cycles the currently-selected link\'s arrow "direction" through ` +
			'["right","left","both","none"] - same as clicking an already-selected link, or pressing Space ' +
			'with a link selected, in the UI. Call set_selected_link first.',
		params: {},
		fn: rotateLinkDirection,
	},
	{
		name: 'rotate_link_dash',
		description: `${MOCK_WORKFLOW_NOTE} Toggles the currently-selected link\'s "dash" between "" (solid) ` +
			'and "4" (dashed) - same as pressing "." with a link selected in the UI. Call set_selected_link ' +
			'first.',
		params: {},
		fn: rotateLinkDashTool,
	},
	{
		name: 'rotate_link_width',
		description: `${MOCK_WORKFLOW_NOTE} Cycles the currently-selected link\'s stroke "width" through ` +
			'[2,4,6] - same as pressing "]" with a link selected in the UI. Call set_selected_link first.',
		params: {},
		fn: rotateLinkWidthTool,
	},
	{
		name: 'align_nodes',
		description: `${MOCK_WORKFLOW_NOTE} Right/bottom-aligns all currently-selected nodes (at least 2) ` +
			'along the given axis - "x" aligns their right edges (same as pressing "R"), "y" aligns their ' +
			'bottom edges (same as pressing "B"). Call set_selection first.',
		params: { axis: { type: 'string', description: '"x" (align right edges) or "y" (align bottom edges)' } },
		example: { axis: 'x' },
		fn: alignNodes,
	},
	{
		name: 'center_nodes',
		description: `${MOCK_WORKFLOW_NOTE} Centers all currently-selected nodes (at least 2) on the same ` +
			'axis line - "x" centers them on a shared vertical line (same as pressing "c"), "y" centers them ' +
			'on a shared horizontal line (same as pressing shift+"C"). Call set_selection first.',
		params: { axis: { type: 'string', description: '"x" (shared vertical center line) or "y" (shared horizontal center line)' } },
		example: { axis: 'y' },
		fn: centerNodesTool,
	},
	{
		name: 'equal_spacing_nodes',
		description: `${MOCK_WORKFLOW_NOTE} Redistributes all currently-selected nodes (at least 3) with ` +
			'equal gaps between them along the given axis, keeping the outermost two nodes fixed - "x" ' +
			'spaces horizontally (same as pressing "d"), "y" spaces vertically (same as pressing shift+"D"). ' +
			'Call set_selection first.',
		params: { axis: { type: 'string', description: '"x" (horizontal spacing) or "y" (vertical spacing)' } },
		example: { axis: 'x' },
		fn: equalSpacingTool,
	},
	{
		name: 'mirror_nodes',
		description: `${MOCK_WORKFLOW_NOTE} Flips the currently-selected nodes\' (at least 2) positions end- ` +
			'to-end along the given axis, like a mirror reflection across the selection\'s own bounding box - ' +
			'"x" mirrors left/right (same as pressing "m"), "y" mirrors top/bottom (same as pressing "M"). ' +
			'Call set_selection first.',
		params: { axis: { type: 'string', description: '"x" (mirror left/right) or "y" (mirror top/bottom)' } },
		example: { axis: 'x' },
		fn: mirrorNodesTool,
	},
	{
		name: 'set_node_color',
		description: `${MOCK_WORKFLOW_NOTE} Sets the fill color of every currently-selected node (if any ` +
			'nodes are selected) or the currently-selected link (if a link is selected instead) - same as ' +
			'picking a color in the UI\'s color picker with something selected. Call set_selection or ' +
			'set_selected_link first. For a single specific node, set_document with just that node\'s ' +
			'"color" changed is equally direct.',
		params: { color: { type: 'string', description: 'Hex color string, e.g. "#3498db" (3, 6, or 8 hex digits)' } },
		example: { color: '#3498db' },
		fn: setNodeColor,
	},
	{
		name: 'get_scene',
		description: `${MOCK_WORKFLOW_NOTE} Returns the canvas' current pan offset as {"x":number,"y":number} ` +
			'- this is the same "scene" the human changes by scrolling/wheeling over the canvas. Node x/y are ' +
			'in canvas coordinates, unaffected by this offset; it only matters if you are trying to reason ' +
			'about what is currently visible on screen.',
		params: {},
		fn: getScene,
	},
	{
		name: 'set_scene',
		description: `${MOCK_WORKFLOW_NOTE} Pans the canvas to the given offset (same effect as the human ` +
			'scrolling/wheeling), e.g. to bring a newly-created node into view. Does not affect any node\'s ' +
			'own x/y.',
		params: {
			x: { type: 'number', description: 'New scene x offset' },
			y: { type: 'number', description: 'New scene y offset' },
		},
		example: { x: 0, y: 0 },
		fn: setScene,
	},
	{
		name: 'get_theme',
		description: 'Returns the current UI theme, "dark" or "light".',
		params: {},
		fn: getTheme,
	},
	{
		name: 'set_theme',
		description: 'Sets the UI theme to "dark" or "light" - same as clicking the theme toggle button.',
		params: { theme: { type: 'string', description: '"dark" or "light"' } },
		example: { theme: 'dark' },
		fn: setTheme,
	},
	{
		name: 'app_description',
		description: 'Call with no args first, on this connection, to get the topic index (node-shape, ' +
			'link-shape, workflow, transient) before writing/reading nodes or links - each topic\'s full text ' +
			'is only fetched when actually needed, instead of every tool description paying for all of it. ' +
			'Call again with {"topic":"..."} to fetch one section\'s full text, e.g. right before writing a ' +
			'node (app_description("node-shape")) or a link (app_description("link-shape")).',
		params: { topic: { type: 'string', description: 'Optional topic key from the index; omit to get the index itself', optional: true } },
		example: { topic: 'node-shape' },
		fn: describeApp,
	},
	{
		name: 'run_transient',
		description: 'Compiles and immediately runs a one-off JS function body for THIS call only, then ' +
			'discards it - nothing persists, it does not become a new registered tool. Use for an aggregate ' +
			'or nontrivial reduction over MANY nodes/links (counts, sums, filters by a computed condition) ' +
			'instead of computing it yourself in-context, which gets unreliable as the diagram grows. See ' +
			'app_description("transient") for the full calling contract and rationale. "code" is a JS ' +
			'function BODY (not "function(){...}"), receives (args, document, window), and whatever it ' +
			'RETURNS becomes the result.',
		params: {
			code: { type: 'string', description: 'JS function body; receives (args, document, window), return value becomes the result' },
			args: { type: 'string', description: 'JSON string passed as `args`; omit if code takes no input', optional: true },
		},
		example: { code: 'return document.querySelectorAll("svg .node").length;' },
		fn: runTransient,
	},
];
