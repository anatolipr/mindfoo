import {
    $nodes, $selection, $selectedLink, $editing, $lineEditing,
    undo, redo, zoomIn, zoomOut, zoomReset, selectAll, doExportToServer,
    toggleEdit, startTypingEdit, move, add, deleteSelection,
    alignFirst, alignLast, center, equalSpacing, mirror, rotateNodeSize, rotateNodeType,
    rotateLineWidth, rotateLineDash, rotateArrows, lineText, lineDelete, toggleLinkArrow,
    spaceDown, spaceUp, $presenting, $selectedStrokes, deleteSelectedStrokes, $tool, $layout, setTool, selectNeighbor, toggleCollapse,
    groupSelection, ungroupSelection, startPresenting, stopPresenting, revealStep, revealAll, revealReset, zoomToFit,
} from '../data/store';
import { duplicateSelection } from '../data/clipboard';
import { copyAsPng } from '../data/exportImage';
import { UNSELECTED } from '../data/types';
import { $dialog } from '../ui/dialog';
import { isTypingTarget } from '../ui/keys';
import { $help, $contextMenu, $colorPopover, $spacingPopover, $palette, openPalette } from './actions';

// Document-level shortcuts. Text fields (node editor, dialogs, the link
// label input) handle their own keys; nothing here runs while typing.
// Presenter mode owns the keyboard: step, reveal, exit.
function presenterKey(e: KeyboardEvent): void {
    const key = e.key;
    const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(key);
    const back = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(key);
    if (next || back || ['Home', 'End', 'F5'].includes(key)) e.preventDefault();
    if (next) revealStep(1);
    else if (back) revealStep(-1);
    else if (key === 'Home') revealReset();
    else if (key === 'End' || key === 'a') revealAll();
    else if (key === 'f') zoomToFit();
    else if (key === 'Escape' || key === 'F5') stopPresenting();
}

// Shift pressed twice in a row opens the command palette.
let lastShift = 0;

function shiftShift(e: KeyboardEvent): boolean {
    if (e.key !== 'Shift' || e.repeat) {
        lastShift = 0;
        return false;
    }
    const now = performance.now();
    const double = now - lastShift < 400;
    lastShift = double ? 0 : now;
    return double;
}

export async function keydown(e: KeyboardEvent): Promise<void> {
    if (isTypingTarget(e) || $dialog.get() || $lineEditing.get() || $palette.get()) return;

    if (shiftShift(e) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (!$presenting.get()) openPalette();
        return;
    }

    if ($presenting.get()) {
        presenterKey(e);
        return;
    }

    const mod = e.metaKey || e.ctrlKey;
    const key = e.key;

    if (key === 'F5') {
        e.preventDefault();
        startPresenting();
        return;
    }

    if (key === ' ' && !mod) {
        e.preventDefault();
        if (!e.repeat) spaceDown();
        return;
    }

    if (mod) {
        const lower = key.toLowerCase();
        if (lower === 's') { e.preventDefault(); doExportToServer(); return; }
        if (lower === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
        if (lower === 'y' && !e.shiftKey) { e.preventDefault(); redo(); return; }
        if (e.shiftKey && e.code === 'KeyE') { e.preventDefault(); copyAsPng(); return; }
        if (!e.shiftKey && e.code === 'KeyD') { e.preventDefault(); duplicateSelection(); return; }
        if (['=', '+', '-', '0'].includes(key)) {
            e.preventDefault();
            if (key === '0') zoomReset();
            else if (key === '-') zoomOut();
            else zoomIn();
            return;
        }
        if (e.code === 'KeyA') { e.preventDefault(); selectAll(); return; }
        if (e.code === 'KeyG') { e.preventDefault(); e.shiftKey ? ungroupSelection() : groupSelection(); return; }
        if (key === '.') { e.preventDefault(); toggleCollapse(); return; }
    }

    // Alt+arrows walk between nodes in any layout
    if (e.altKey && !mod && key.startsWith('Arrow')) {
        e.preventDefault();
        selectNeighbor(key.slice(5).toLowerCase() as 'left' | 'right' | 'up' | 'down');
        return;
    }

    // Single-key shortcuts must not fire under Cmd/Ctrl/Alt (Cmd+C is copy,
    // not "center"); only deletion keeps its modifier form.
    if ((mod || e.altKey) && key !== 'Backspace' && key !== 'Delete') return;

    if (key === 'Escape') {
        if ($help.get()) $help.set(false);
        else if ($tool.get() !== 'select') setTool('select');
        else if ($colorPopover.get()) $colorPopover.set(null);
        else if ($spacingPopover.get()) $spacingPopover.set(null);
        else {
            $selection.set([]);
            $selectedStrokes.set([]);
            $selectedLink.set(UNSELECTED);
        }
        return;
    }

    if (key === '?') {
        $help.set(!$help.get());
        return;
    }
    if ($contextMenu.get()) return;

    if ($selectedStrokes.get().length && (key === 'Backspace' || key === 'Delete')) {
        e.preventDefault();
        deleteSelectedStrokes();
        return;
    }

    const selection = $selection.get();

    if (selection.length !== 0) {
        const single = selection.length === 1;

        if ((key === 'Enter' || key === 'F2') && single) {
            e.preventDefault();
            toggleEdit($nodes.get()[selection[0]].id);
        } else if (key.startsWith('Arrow') && $layout.get() !== 'free') {
            // auto layouts place nodes; arrows walk between them instead
            e.preventDefault();
            selectNeighbor(key.slice(5).toLowerCase() as 'left' | 'right' | 'up' | 'down');
        } else if (key === 'ArrowLeft') {
            move('x', e.shiftKey ? -10 : -1)
        } else if (key === 'ArrowRight') {
            move('x', e.shiftKey ? 10 : 1)
        } else if (key === 'ArrowDown') {
            move('y', e.shiftKey ? 10 : 1)
        } else if (key === 'ArrowUp') {
            move('y', e.shiftKey ? -10 : -1)
        } else if (key === ']') {
            rotateNodeSize();
        } else if (key === 'Tab') {
            e.preventDefault();
            await add();
        } else if ((key === 'Backspace' || key === 'Delete') && (mod || !$editing.get())) {
            e.preventDefault();
            deleteSelection();
        } else if (single && key.length === 1) {
            // Type-to-edit: with one node selected, typing replaces its text.
            e.preventDefault();
            startTypingEdit(key);
        } else if (key === 'C') {
            center('y', 'height');
        } else if (key === 'c') {
            center('x', 'width');
        } else if (e.code === 'KeyL') {
            alignFirst('x', 'width');
        } else if (e.code === 'KeyR') {
            alignLast('x', 'width');
        } else if (e.code === 'KeyT') {
            alignFirst('y', 'height');
        } else if (e.code === 'KeyB') {
            alignLast('y', 'height');
        } else if (key === 'D') {
            equalSpacing('y', 'height');
        } else if (key === 'd') {
            equalSpacing('x', 'width');
        } else if (key === 'm') {
            mirror('x', 'width');
        } else if (key === 'M') {
            mirror('y', 'height');
        }
    } else if ($selectedLink.get() !== UNSELECTED) {
        if (key === ']') {
            rotateLineWidth();
        } else if (key === '.') {
            rotateLineDash();
        } else if (key === 'Enter' || key === 'F2') {
            e.preventDefault();
            lineText();
        } else if (key === 'ArrowLeft') {
            toggleLinkArrow('left');
        } else if (key === 'ArrowRight') {
            toggleLinkArrow('right');
        } else if (key === 'Backspace' || key === 'Delete') {
            lineDelete($selectedLink.get());
        }
    }
}

// Space: tap rotates node shape / link arrows (as before); hold + drag pans.
export function keyup(e: KeyboardEvent): void {
    if (e.key !== ' ' || $presenting.get()) return;
    if (!spaceUp()) return;
    if ($selection.get().length) rotateNodeType();
    else if ($selectedLink.get() !== UNSELECTED) rotateArrows();
}
