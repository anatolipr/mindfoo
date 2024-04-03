
import  Foo  from 'avos/src/foo-store/foo';

import type { Line, Link, Coordinates, Node, NodeId, optionalSelectedIndex } from './types';
import { nanoid } from 'nanoid';
import { tick } from 'svelte';
import { lineCurveFactor } from './consts';
import intersect from "path-intersection"
import { deCasteljau, makeCurve, makeRect } from '../geo';
import { directions } from './directions';

export const $nodes: Foo<Node[]> = new Foo(<Node[]>[]);
export const $links: Foo<Link[]> = new Foo(<Link[]>[]);
export const $lines: Foo<Line[]> = new Foo(<Line[]>[]);

export const $mouse: Foo<Coordinates> = new Foo({x:0, y:0})
export const $scene: Foo<Coordinates> = new Foo({x:0, y:0})
export const $selectionStart: Foo<Coordinates> = new Foo({x: 0, y: 0});

export const $moving: Foo<boolean> = new Foo(false);

export const $selection: Foo<number[]> = new Foo(<number[]>[]);
export const $previousSelection: Foo<number[]> = new Foo(<number[]>[]);
export const $selectedLink: Foo<optionalSelectedIndex> = new Foo(-1);


export const $nodeMap: Foo<{[key: NodeId]: Node}> = new Foo({});

export const $selecting: Foo<boolean> = new Foo(false);

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

        $selection.set([nodes0.length-1])

        return nodes0
    })


    await tick();

    resize($nodes.get().length-1, true);
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

