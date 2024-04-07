
import  Foo  from 'avos/src/foo-store/foo';

import { type Line, type Link, type Coordinates, 
    type Node, type NodeId, type OptionalSelectedIndex, UNSELECTED, DEFAULT_WIDTH, DEFAULT_DASH, DEFAULT_NODE_TYPE, DEFAULT_NODE_FONT_SIZE } from './types';
import { nanoid } from 'nanoid';
import { tick } from 'svelte';
import { lineCurveFactor } from './consts';
import intersect from "path-intersection"
import { deCasteljau, makeCurve, makeShape } from '../geo';
import { determineNextDirection, toggleArrows, type Direction } from './directions';
import { readFile, saveFile } from 'avos/src/util';
import { rgbAsHex } from '../util';
import { nextDash, nextWidth } from './properties/linkPropertiesHelper';
import { nextNodeSize, nextNodeType } from './properties/nodePropertiesHelper';

export const $nodes: Foo<Node[]> = new Foo(<Node[]>[], localStorage.getItem('debugNodes') ? 'nodes' : undefined);
export const $links: Foo<Link[]> = new Foo(<Link[]>[], localStorage.getItem('debugLinks') ? 'links' : undefined);
export const $lines: Foo<Line[]> = new Foo(<Line[]>[], localStorage.getItem('debugLines') ? 'lines' : undefined);

export const $mouse: Foo<Coordinates> = new Foo({x:0, y:0})
export const $scene: Foo<Coordinates> = new Foo({x:0, y:0})
export const $selectionStart: Foo<Coordinates> = new Foo({x: 0, y: 0});

export const $moving: Foo<boolean> = new Foo(false);
export const $editing: Foo<boolean> = new Foo(false);

export const $selection: Foo<number[]> = new Foo(<number[]>[], "selection");
export const $previousSelection: Foo<number[]> = new Foo(<number[]>[]);
export const $selectedLink: Foo<OptionalSelectedIndex> = new Foo(UNSELECTED as OptionalSelectedIndex);

export const $nodeMap: Foo<{[key: NodeId]: Node}> = new Foo({});

export const $selecting: Foo<boolean> = new Foo(false);
export const $menu: Foo<string> = new Foo('');

// ---

export function init() {
    const nodes0 = $nodes.get();
    for(let i=0; i<nodes0.length; i++) {
        resize(i)
    }
    makeLines();

    document.addEventListener('keydown', keydown);
    return () => {
        document.removeEventListener('keydown', keydown)
    }
}



export function rotateArrows(): void {
    const i = $selectedLink.get();
    if (i === UNSELECTED) return;

    $links.update(links => {
        links[i].direction = 
           determineNextDirection(links[i].direction)
        return links;
    })
    
}

export function rotateLineDash(): void {
    const i = $selectedLink.get();
    if (i === UNSELECTED) return;

    $links.update(links => {
        links[i].dash = nextDash(links[i].dash)
        return links
    })
}

export function rotateLineWidth(): void {
    const i = $selectedLink.get();
    if (i === UNSELECTED) return;

    $links.update(links => {
        links[i].width = nextWidth(links[i].width)
        return links
    })
}


export function lineText() {
    let selectedLink: OptionalSelectedIndex = $selectedLink.get();
    if (selectedLink === UNSELECTED) return;
    
    $links.update(links => {
        let text = prompt("line text:", links[selectedLink].text)
        if (text !== null) {
            links[selectedLink].text = text
        }
        return links;
    })
}

export function lineClick(i: number, text: boolean = false) {
    let prevSelected = $selectedLink.get();
    $selectedLink.set(i);
    $selection.set([]);
    
    if (text) {
        lineText();
        return
    }

    if (prevSelected !== i || text) return;
    rotateArrows();
}

export async function add() {


    let id = nanoid(5);

    $nodes.update((nodes0: Node[]) => {

        const selection = $selection.get();

        const mouse: Coordinates = $mouse.get();
        const scene: Coordinates = $scene.get();
    
        let selected: number | undefined = selection.length > 0 ? selection[0] : undefined;
        let x = selected ? nodes0[selected].x + 50 :  mouse.x - scene.x;
        let y = selected ? nodes0[selected].y + 50 :  mouse.y - scene.y;

        nodes0.push(
            {
                id,
                width: 140,
                height: 140,
                x,
                y,
                text: 'Enter',
                minHeight: 0,
                minWidth: 0,
                color: '',
                size: DEFAULT_NODE_FONT_SIZE,
                type: DEFAULT_NODE_TYPE
            }
        );

        $selection.set([nodes0.length - 1])
        
        makeNodesMap(nodes0);

        if (selected !== undefined) {
            addLink(nodes0[selected!].id, id);
        }

        $selection.set([nodes0.length - 1])

        return nodes0
    })


    await tick();

    resize($nodes.get().length - 1, true);
    document.getElementById(`d${id}`)?.focus()
    
}

export function resize(i: number, doLines: boolean = false) {

    const nodes0 = $nodes.get();

    if(!nodes0[i]) return

    let rect: DOMRect = document.getElementById(`d${nodes0[i].id}`)
            ?.getBoundingClientRect()!;
    nodes0[i].width = rect.width;
    nodes0[i].height = rect.height;
    if (doLines) {
        makeLines()
    }
}

function makeLines(): void {

    const links: Link[] = $links.get()
    const nodes = $nodeMap.get();

    let lines: Line[] = [];

    for(let i = 0; i<links.length; i++) {

        let link = links[i];

        let node2 = nodes[link.one];
        let node1 = nodes[link.two];
        let cp1, cp2;

        let reverse = false;
        if (node1.x < node2.x) {
            let node1a  = node1;
            node1 = node2;
            node2 = node1a;
            reverse = true;
            
            cp1 = node2.x - (node2.x - node1.x) * lineCurveFactor;
            cp2 = node1.x + (node2.x - node1.x) * lineCurveFactor;
        } else {
            cp2 = node1.x - (node1.x - node2.x) * lineCurveFactor;
            cp1 = node2.x + (node1.x - node2.x) * lineCurveFactor;
        }

        let c: number[][] = [[node1.x, node1.y],
            [cp1, node1.y],
            [cp2, node2.y],
            [node2.x, node2.y]];

        let i1 = intersect(makeCurve(c), makeShape(node2));

        if (i1 && i1[0]) {
            c = deCasteljau(c, i1[0].t1);
            i1 = intersect(makeCurve(c.reverse()), makeShape(node1));
            if(i1 && i1[0])
                c = deCasteljau(c, i1[0].t1);
        }

        lines.push(
                {	id: node1.id + '-' + node2.id,
                    c: makeCurve(c),
                    reverse,
                }
        );
    }

    $lines.set(lines);
}


function makeNodesMap(nodes0: Node[]): void {

    const rv: {[key: string | number]: Node} = {};

    for (let i = 0; i < nodes0.length; ++i) {
        rv[nodes0[i].id] = nodes0[i];
    }
        
    $nodeMap.set(rv)
}

//interaction

export function wheel(e: WheelEvent) {
    $scene.update(scene => {
        scene.x -= e.deltaX;
        scene.y -= e.deltaY;
        return scene;
    })
}

export function selectNode(i: number, e: MouseEvent) {
    
    $previousSelection.set([...$selection.get()]);
    let previousSelection = $previousSelection.get()

    let selected = i;

    if ($selection.get().indexOf(i) === -1) {
        $selection.set([i]);
    }

    let selection = $selection.get();

    $selectedLink.set(UNSELECTED);
    $moving.set(true);

    if (e.shiftKey) {
        
        $selection.update(selection => {

            previousSelection.forEach((i) => {
                if (selection.indexOf(i) === -1) {
                    selection.push(i)
                }
            })

            return selection;
        })

    } else if ((e.metaKey || e.button === 2)
            && selection.length === 1
            && previousSelection.indexOf(i) === -1) {

            const nodes0 = $nodes.get();

            previousSelection.forEach((previous) => {


            let found  = $links.get().find(link =>
                    (link.one === nodes0[previous].id &&
                            link.two === nodes0[selected].id)
                    ||
                    (link.one === nodes0[selected].id &&
                            link.two === nodes0[previous].id)
            )

            if (!found) {
                addLink(nodes0[previous].id, nodes0[selected].id)
                makeLines()
            }

        })

    }
}

export function addLink(one: NodeId, two: NodeId): void {

    $links.update(links => {
        links.push({
            one,
            two,
            direction: 'none',
            width: DEFAULT_WIDTH,
            dash: DEFAULT_DASH
        });
        return links;
    })

}

export function mouseup(e: MouseEvent) {
    if ($selecting.get()) {
        $previousSelection.set($selection.get());
        
        const selectionStart = $selectionStart.get();
        const mouse = $mouse.get();
        const scene = $scene.get();

        let y = selectionStart.y < mouse.y ? selectionStart.y : mouse.y;
        let x = selectionStart.x < mouse.x ? selectionStart.x : mouse.x;
        y -= scene.y
        x -= scene.x
        let width = Math.abs(selectionStart.x - mouse.x)
        let height = Math.abs(selectionStart.y - mouse.y)
        let x1 = x + width
        let y1 = y + height

        const selection: number[] = [];
        const nodes0 = $nodes.get();

        for(let i = 0; i<nodes0.length; i++) {
            let node = nodes0[i];
            if (x < (node.x - node.width/2)
                    && y < (node.y - node.height/2)
                    && x1 > (node.x + node.width/2)
                    && y1 > (node.y + node.height/2)) {
                selection.push(i);
            }
        }

        if (e.shiftKey) {
            $previousSelection.get().forEach((i) => {
                if (selection.indexOf(i) === -1) {
                    selection.push(i)
                }
            })
        }
        $selection.set(selection);
    }

    $moving.set(false);
    $selecting.set(false);

}

export function mousemove(e: MouseEvent) {

    $mouse.set({
        x: e.clientX,
        y: e.clientY
    })

    const selection = $selection.get();
    const moving = $moving.get();
    if(selection.length === 0 || !moving) return

    $nodes.update(nodes0 => {

        selection.forEach((i) => {
            nodes0[i].x += e.movementX;
            nodes0[i].y += e.movementY;
        })

        return nodes0;
    })
    
    makeLines()

}

export function equalSpacing(cProp: string, diProp: string): void {

    if ($selection.get().length < 3) return;

    $nodes.update(nodes0 => {

        $selection.update(selection => {
            selection.sort((one, two) => nodes0[one][cProp] < nodes0[two][cProp] ? -1 : 1)
            return selection;
        });

        let selection = $selection.get();
        let first = selection[0];
        let last = selection[selection.length - 1]

        let min = nodes0[first][cProp] - nodes0[first][diProp] / 2;
        let max = nodes0[last][cProp] + nodes0[last][diProp] / 2;
        let totalWidth = selection.map(i => nodes0[i][diProp])
                .reduce((one, two) => one + two, 0);

        let space = ((max - min) - totalWidth) / (selection.length - 1);

        let distance = min
        for (let i = 0; i < selection.length; i++) {
            let s = selection[i]
            nodes0[s][cProp] = distance + nodes0[s][diProp] / 2;
            distance = distance + nodes0[s][diProp] + space;
        }
        return nodes0;
    })

    makeLines()
    
}

export function rotateNodeType() {
    let selection = $selection.get();
    if (selection.length < 1) return;
    
    $nodes.update(nodes0 => {
        nodes0.forEach((node,idx) => {
            if (selection.indexOf(idx) > -1) {
                node.type = nextNodeType(node.type);
            }
        })
        return nodes0;
    })

    makeLines();
    
}

export function rotateNodeSize() {
    let selection = $selection.get();
    if (selection.length < 1) return;
    
    $nodes.update(nodes0 => {
        nodes0.forEach((node,idx) => {
            if (selection.indexOf(idx) > -1) {
                node.size = nextNodeSize(node.size);
            }
        })
        return nodes0;
    })
    
    makeLines();
}

export function mirror(cProp: string, diProp: string): void {

    if ($selection.get().length < 2) return;

    $nodes.update(nodes0 => {

        $selection.update(selection => {
            selection.sort((one, two) => nodes0[one][cProp] < nodes0[two][cProp] ? -1 : 1)
            return selection;
        });

        let selection = $selection.get();
        let first = selection[0];
        let last = selection[selection.length - 1]

        let min = nodes0[first][cProp] - nodes0[first][diProp] / 2;
        let max = nodes0[last][cProp] + nodes0[last][diProp] / 2;

        selection.forEach((i) => {
            let nodeRight = nodes0[i][cProp] + nodes0[i][diProp] / 2;
            let distanceRight = max - nodeRight;
            nodes0[i][cProp] = min + distanceRight + nodes0[i][diProp] / 2;
        })
        
        return nodes0;
    });
    makeLines()
    
}

function alignFirst(cProp: string, diProp: string): void {

    let selection = $selection.get();
    if (selection.length < 2) return;

    $nodes.update(nodes0 => {

        let min: number;

        selection.forEach((i) => {
            if (min === undefined || nodes0[i][cProp] - nodes0[i][diProp] / 2 < min) {
                min = nodes0[i][cProp] - nodes0[i][diProp] / 2
            }
        })
    
        selection.forEach((i) => {
            nodes0[i][cProp] = min + nodes0[i][diProp] / 2
        })

        return nodes0;
    })

    makeLines();

}

export function alignLast(cProp: string, diProp: string): void {

    let selection = $selection.get();
    if (selection.length < 2) return;

    $nodes.update(nodes0 => {

        let max: number;
        selection.forEach((i) => {
            if (max === undefined || nodes0[i][cProp] + nodes0[i][diProp] / 2 > max) {
                max = nodes0[i][cProp] + nodes0[i][diProp] / 2
            }
        })
    
        selection.forEach((i) => {
            nodes0[i][cProp] = max - nodes0[i][diProp] / 2
        })

        return nodes0;
    })

    makeLines();
    
}

export function center(cProp: string, diProp: string) {

    if ($selection.get().length < 2) return;

    $nodes.update(nodes0 => {

        $selection.update(selection => {
            selection.sort((one, two) => nodes0[one][cProp] < nodes0[two][cProp] ? -1 : 1)
            return selection;
        })
        
        let selection = $selection.get();
        let first = selection[0];
        let last = selection[selection.length - 1]

        let min = nodes0[first][cProp] - nodes0[first][diProp] / 2;
        let max = nodes0[last][cProp] + nodes0[last][diProp] / 2;


        selection.forEach((i) => {
            nodes0[i][cProp] = min + (max - min) / 2
        })

        return nodes0;
    });

    makeLines()
}

export function doExport() {
    const fname = prompt("file name");
    if (name === null) {
        return
    }
    saveFile(JSON.stringify({
        nodes: $nodes.get(), links: $links.get()
    }), (fname || 'untitled') + '.arrows')
}

export async function doImport() {
    const content: string = await readFile();
    if (content) {

        const parsed: {nodes: Node[], links: Link[]} = JSON.parse(content);

        if ( ! parsed.hasOwnProperty('links') ) {
            alert('invalid format: 1')
            return;
        }

        if (! parsed.hasOwnProperty('nodes')) {
            alert('invalid format: 2')
            return;
        }
        
        
        
        $nodes.set([...parsed.nodes]);
        $links.set([...parsed.links]);

        makeNodesMap($nodes.get());

        $selection.set([])
        
        //?
        makeLines();
    }
}

export function move(cProp: string, delta: number): void {

    $nodes.update(nodes0 => {
        $selection.get().forEach(i => nodes0[i][cProp] += delta);
        return nodes0;
    })

    makeLines();
}

async function keydown(e: KeyboardEvent): Promise<void> {

    if (e.metaKey && e.code === 'KeyA') {
        $selection.update(selection => {
            selection = [...Array($nodes.get().length).keys()].map(x => x++);
            return selection;
        })
        
        return;
    }

    if ($selection.get().length !== 0) {

        if (e.key === 'ArrowLeft') {
            move('x', e.shiftKey ? -10 : -1)
        } else if (e.key === 'ArrowRight') {
            move('x', e.shiftKey ? 10 : 1)
        } else if (e.key === 'ArrowDown') {
            move('y', e.shiftKey ? 10 : 1)
        } else if (e.key === 'ArrowUp') {
            move('y', e.shiftKey ? -10 : -1)
        } else if (e.key === 'C') {
            center('y', 'height');
        } else if (e.key === 'c') {
            center('x', 'width');
        } else if (e.code === 'KeyL') {
            alignFirst('x', 'width');
        } else if (e.code === 'KeyR') {
            alignLast('x', 'width');
        } else if (e.code === 'KeyT') {
            alignFirst('y', 'height');
        } else if (e.code === 'KeyB') {
            alignLast('y', 'height');
        } else if (e.key === 'D') {
            equalSpacing('y', 'height');
        } else if (e.key === 'd') {
            equalSpacing('x', 'width');
        } else if (e.key === 'm') {
            mirror('x', 'width');
        } else if (e.key === 'M') {
            mirror('y', 'height');
        } else if (e.key === ' ') {
            rotateNodeType();
        } else if (e.key === ']') {
            rotateNodeSize();
        } else if (e.key === 'Tab') {

            e.stopPropagation();
            e.preventDefault();
            await add();

        } else if (e.key === 'Backspace' && (e.metaKey || !$editing.get())) {

            let x = $nodes.get().length;

            while(x--) {
                if ($selection.get().indexOf(x) > -1) {
                    let selected = x;
                    let selectedNodeId: NodeId = $nodes.get()[selected].id;
                    $links.update(links => {
                        let i = links.length;
                        while(i--) {
                            if (links[i].one === selectedNodeId
                                    || links[i].two === selectedNodeId) {
                                links.splice(i, 1);
                            }
                        }

                        return links;
                    })

                    

                    $nodes.update(nodes0 => {
                        nodes0.splice(selected,1);
                        return nodes0;
                    })
                    
                }
            }
            //TODO - only do this if we need to
            
            makeLines()

            $selection.set([])
            $previousSelection.set([])
        }

    } else if ($selectedLink.get() !== UNSELECTED) {
        let selectedLink = $selectedLink.get();

        if (e.key === 'w') {
            rotateLineWidth();
        } else if (e.key === '.') {
            rotateLineDash();
        } else if (e.key === 'Enter') {
            lineText();
        } else if (['ArrowLeft', 'ArrowRight'].includes(e.key) ) {
            const keyMap: {[key: string]: Direction} = {
                'ArrowLeft': 'left', 'ArrowRight': 'right',
            }
            const toggle = ((toggleDirection: Direction) => {
                $links.update(links => {
                    links[selectedLink].direction = 
                    toggleArrows(links[selectedLink].direction, toggleDirection)
                    return links
                })
            })

            toggle(keyMap[e.key]);
            
        } else if (e.key === 'Backspace') {
            lineDelete($selectedLink.get());
        } else if (e.key === ' ') {
            rotateArrows()
        }

    }

}

export function lineDelete(i: number): void {

    $links.update(links => {
                links.splice(i, 1);
                return links;
            })

    $selectedLink.set(UNSELECTED);
    makeLines();
}



export function bodyMouseDown(e: MouseEvent) {
    $moving.set(false);
    $editing.set(false);
    $selectedLink.set(UNSELECTED);
    $selecting.set(true);

    $selectionStart.set({...$mouse.get()})

    $menu.set('');
}

export function colorChange(e: CustomEvent) {

    const selection = $selection.get();
    const selectedLink = $selectedLink.get();
    if(selection.length === 0 && selectedLink === UNSELECTED) return;

    let c: {r:number, g:number, b:number, a:number} = e.detail;
    let hex = rgbAsHex([c.r, c.g, c.b, Math.round(c.a*255)]);

    if (selection.length > 0) {
        $nodes.update(nodes0 => {
            selection.forEach(i => nodes0[i].color = hex)
            return nodes0;
        })
    } else {
        $links.update(links => {
            links[selectedLink].color = hex
            return links;
        })
    }
    
}


