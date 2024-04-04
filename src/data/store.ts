
import  Foo  from 'avos/src/foo-store/foo';

import type { Line, Link, Coordinates, Node, NodeId, optionalSelectedIndex } from './types';
import { nanoid } from 'nanoid';
import { tick } from 'svelte';
import { lineCurveFactor } from './consts';
import intersect from "path-intersection"
import { deCasteljau, makeCurve, makeRect } from '../geo';
import { directions } from './directions';
import { readFile, saveFile } from 'avos/src/util';
import { rgbAsHex } from '../util';

export const $nodes: Foo<Node[]> = new Foo(<Node[]>[]);
export const $links: Foo<Link[]> = new Foo(<Link[]>[]);
export const $lines: Foo<Line[]> = new Foo(<Line[]>[]);

export const $mouse: Foo<Coordinates> = new Foo({x:0, y:0})
export const $scene: Foo<Coordinates> = new Foo({x:0, y:0})
export const $selectionStart: Foo<Coordinates> = new Foo({x: 0, y: 0});

export const $moving: Foo<boolean> = new Foo(false);
export const $editing: Foo<boolean> = new Foo(false);

export const $selection: Foo<number[]> = new Foo(<number[]>[]);
export const $previousSelection: Foo<number[]> = new Foo(<number[]>[]);
export const $selectedLink: Foo<optionalSelectedIndex> = new Foo(-1);


export const $nodeMap: Foo<{[key: NodeId]: Node}> = new Foo({});

export const $selecting: Foo<boolean> = new Foo(false);
export const $menu: Foo<string> = new Foo('');

// ---

// export function init() {
//     const nodes0 = $nodes.get();
//     for(let i=0; i<nodes0.length; i++) {
//         resize(i)
//     }
//     makeLines();

//     document.addEventListener('keydown', keydown);
//     return () => {
//         document.removeEventListener('keydown', keydown)
//     }
// }



export function rotateArrows(i: number) {

    $links.update(links => {

        let nextDirection;
        let currentDirection = directions.indexOf(links[i].direction);

        if (currentDirection < 0) {
            nextDirection = 0;
        } else {
            nextDirection = currentDirection + 1;

            if (currentDirection >= directions.length - 1) {
                nextDirection = 0
            }
        }
        links[i].direction = directions[nextDirection]
        
        return links;
    })
    
}

export function lineClick(i: number) {
    let prevSelected = $selectedLink.get();
    $selectedLink.set(i);
    $selection.set([]);
    
    if (prevSelected !== i) return;
    rotateArrows(i);
}

async function add() {


    let id = nanoid();

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
                width: 0,
                height: 0,
                x,
                y,
                text: 'Enter',
                minHeight: 0,
                minWidth: 0,
                color: '',
            }
        );

        $selection.set([nodes0.length - 1])
        
        makeNodesMap(nodes0);

        if (selected !== undefined) {
            
            $links.update(links => {
                links.push({
                    one: nodes0[selected!].id,
                    two: id,
                    direction: 'none'
                });

                return links;
            })
            
        }

        $selection.set([nodes0.length - 1])

        return nodes0
    })


    await tick();

    resize($nodes.get().length - 1, true);
    document.getElementById(`d${id}`)?.focus()
    
}

function resize(i: number, doLines: boolean = false) {

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

    let result: Line[] = [];

    for(let i = 0; i<links.length; i++) {

        let link = links[i];

        let node1 = nodes[link.one];
        let node2 = nodes[link.two];
        let cp1, cp2;

        if (node1.x <= node2.x) {
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

        let i1 = intersect(makeCurve(c), makeRect(node2.width, node2.height, node2.x, node2.y, 8));

        if (i1 && i1[0]) {
            c = deCasteljau(c, i1[0].t1);
            i1 = intersect(makeCurve(c.reverse()), makeRect(node1.width, node1.height, node1.x, node1.y, 8));
            if(i1 && i1[0])
                c = deCasteljau(c, i1[0].t1);
        }

        result.push(
                {	id: node1.id + '-' + node2.id,
                    c: makeCurve(c)
                }
        );
    }

    $lines.set(result);
}

function makeNodesMap(nodes0: Node[]): void {

    const rv: {[key: string | number]: Node} = {};

    for (let i = 0; i < nodes0.length; ++i) {
        rv[nodes0[i].id] = nodes0[i];
    }
        
    $nodeMap.set(rv)
}

//interaction

function wheel(e: WheelEvent) {
    $scene.update(scene => {
        scene.x -= e.deltaX;
        scene.y -= e.deltaY;
        return scene;
    })
}

function selectNode(i: number, e: MouseEvent) {

    
    $previousSelection.set($selection.get());
    let previousSelection = $previousSelection.get()

    let selected = i;

    if ($selection.get().indexOf(i) === -1) {
        $selection.set([i]);
    }

    let selection = $selection.get();

    $selectedLink.set(-1);
    $moving.set(true);

    if (e.shiftKey) {
        previousSelection.forEach((i) => {
            if (selection.indexOf(i) === -1) {
                selection.push(i)
            }
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
                $links.update(links => {
                    links.push({
                        one: nodes0[previous].id,
                        two: nodes0[selected].id,
                        direction: 'none'
                    });
                    return links;
                })
            }

        })


    }
}

function mouseup(e: MouseEvent) {
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

function mousemove(e: MouseEvent) {

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

    } else if ($selectedLink.get() !== -1) {

        if (e.key === 'Backspace') {
            lineDelete($selectedLink.get());
        } else if (e.key === ' ') {
            rotateArrows($selectedLink.get())
        }

    }

}

export function lineDelete(i: number): void {

    $links.update(links => {
                links.splice(i, 1);
                return links;
            })

    $selectedLink.set(-1);
    makeLines();
}

export function bodyMouseDown(e: MouseEvent) {
    $moving.set(false);
    $editing.set(false);
    $selectedLink.set(-1);
    $selecting.set(true);

    $selectionStart.set({...$mouse.get()})

    $menu.set('');
}

export function colorChange(e: CustomEvent) {
    const selection = $selection.get()
    if(selection.length === 0) return;

    let c: {r:number, g:number, b:number, a:number} = e.detail;
    let hex = rgbAsHex([c.r, c.g, c.b, Math.round(c.a*255)]);

    $nodes.update(nodes0 => {
        selection.forEach(i => nodes0[i].color = hex)
        return nodes0;
    })
}


