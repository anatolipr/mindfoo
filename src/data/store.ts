
import  Foo  from 'avos/src/foo-store/foo';

import type { Line, Link, Node, NodeId } from './types';

export const $nodeStore: Foo<Node[]> = new Foo(<Node[]>[]);

export const $linkStore: Foo<Link[]> = new Foo(<Link[]>[]);

export const $lineStore: Foo<Line[]> = new Foo(<Line[]>[]);

export const $nodeMap: Foo<{[key: NodeId]: Node}> = new Foo({});