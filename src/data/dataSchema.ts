// Canonical description of Node/Link field shapes, kept next to types.ts so
// it can't silently drift from what the renderer actually reads. Used by
// mcpbridge.ts to validate agent-supplied documents before they ever reach
// the live $nodes/$links stores - modeled after htmlpaint.com's
// src/node/nodeSchema.js, adapted for mindfoo's flat (non-recursive)
// nodes/links arrays. This is also the source of truth the "EXACT NODE/LINK
// SHAPE" prose in mcpbridge.ts's __mcpSummary should stay consistent with.
//
// Each field is one of:
//   {type: 'string'|'number'|'boolean', required}
//   {type: 'enum', values: [...], required}
// `required: false` fields may be omitted OR explicitly set to `undefined`;
// when present they must still match `type`.

type FieldSpec =
	| { type: 'string'; required: boolean }
	| { type: 'number'; required: boolean }
	| { type: 'boolean'; required: boolean }
	| { type: 'enum'; values: readonly string[]; required: boolean }
	| { type: 'nodeId'; required: boolean };

// "width"/"height"/"minHeight" are deliberately absent here even though the
// Node type carries them: mcpbridge's fillNodeDefaults never accepts them
// from an agent (see comment there) - they're a DOM-measurement cache, not
// agent-authored input, so they don't belong in the input-facing schema.
export const NODE_FIELDS: Record<string, FieldSpec> = {
	id: { type: 'nodeId', required: false },
	x: { type: 'number', required: false },
	y: { type: 'number', required: false },
	minWidth: { type: 'number', required: false },
	maxWidth: { type: 'number', required: false },
	color: { type: 'string', required: false },
	text: { type: 'string', required: false },
	size: { type: 'enum', values: ['15px', '20px', '25px', '30px'], required: false },
	type: { type: 'number', required: false },
};

export const LINK_FIELDS: Record<string, FieldSpec> = {
	one: { type: 'nodeId', required: true },
	two: { type: 'nodeId', required: true },
	direction: { type: 'enum', values: ['none', 'both', 'left', 'right'], required: false },
	dash: { type: 'enum', values: ['', '4'], required: false },
	color: { type: 'string', required: false },
	width: { type: 'number', required: false },
	text: { type: 'string', required: false },
	textSize: { type: 'string', required: false },
};

function typeMatches(value: any, spec: FieldSpec): boolean {
	switch (spec.type) {
		case 'string': return typeof value === 'string';
		case 'number': return typeof value === 'number' && !Number.isNaN(value);
		case 'boolean': return typeof value === 'boolean';
		case 'nodeId': return typeof value === 'string' || (typeof value === 'number' && !Number.isNaN(value));
		case 'enum': return typeof value === 'string' && spec.values.includes(value);
		default: return true;
	}
}

function describeType(spec: FieldSpec): string {
	if (spec.type === 'enum') return `one of ${JSON.stringify(spec.values)}`;
	if (spec.type === 'nodeId') return 'a string or number';
	return `a ${spec.type}`;
}

function assertValidEntry(entry: any, fields: Record<string, FieldSpec>, kind: string, here: string) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new Error(`${kind} at "${here}" is not a plain object (got: ${JSON.stringify(entry)})`);
	}

	for (let [field, spec] of Object.entries(fields)) {
		let has = Object.prototype.hasOwnProperty.call(entry, field) && entry[field] !== undefined;
		if (!has) {
			if (spec.required) {
				throw new Error(`${kind} at "${here}" is missing required field "${field}" (expected ${describeType(spec)})`);
			}
			continue;
		}
		if (!typeMatches(entry[field], spec)) {
			throw new Error(`${kind} at "${here}" has "${field}" of the wrong type/value ` +
				`(expected ${describeType(spec)}, got: ${JSON.stringify(entry[field])})`);
		}
	}

	for (let key of Object.keys(entry)) {
		if (!fields[key]) {
			throw new Error(`${kind} at "${here}" has unrecognized field "${key}" - only these fields are ` +
				`valid on a ${kind}: ${Object.keys(fields).join(', ')}`);
		}
	}
}

/**
 * Validates an array of node objects. Throws a single Error, on the first
 * problem found, with a path-qualified message an agent can act on directly.
 * Does not mutate its input.
 */
export function assertValidNodes(nodeList: any): asserts nodeList is any[] {
	if (!Array.isArray(nodeList)) {
		throw new Error(`"nodes" is not an array (got: ${JSON.stringify(nodeList)})`);
	}
	nodeList.forEach((node, i) => assertValidEntry(node, NODE_FIELDS, 'node', `nodes/${i}`));
}

/**
 * Validates an array of link objects. Throws a single Error, on the first
 * problem found, with a path-qualified message an agent can act on directly.
 * Does not mutate its input.
 */
export function assertValidLinks(linkList: any): asserts linkList is any[] {
	if (!Array.isArray(linkList)) {
		throw new Error(`"links" is not an array (got: ${JSON.stringify(linkList)})`);
	}
	linkList.forEach((link, i) => assertValidEntry(link, LINK_FIELDS, 'link', `links/${i}`));
}
