// Cloud saves: Google sign-in (Firebase Auth) + named graphs in Firestore.
// Loaded lazily from main.js so users who never open the Cloud dialog download no Firebase code.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged,
    signInWithPopup,
    signOut,
    GoogleAuthProvider
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
    initializeFirestore,
    collection,
    doc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: 'AIzaSyBZ76nATvuwQBnamd_q-Vf1IQ7WuR0WoNY',
    authDomain: 'graphiti-6b927.firebaseapp.com',
    projectId: 'graphiti-6b927',
    storageBucket: 'graphiti-6b927.firebasestorage.app',
    messagingSenderId: '949037446356',
    appId: '1:949037446356:web:117e77d8dcf9f1de5d3741'
};

const HINT_KEY = 'graphiti_cloud_hint';
const LINK_KEY = 'graphiti_cloud_link';
const MAX_GRAPHS = 100;
const NAME_MAX = 80;
const LIST_CACHE_MS = 2 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 15000;

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
// Auto-detect long polling so restrictive school proxies that break WebChannel still work.
const db = initializeFirestore(firebaseApp, { experimentalAutoDetectLongPolling: true });
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

let app = null;
let initialised = false;
let user = null;
let graphs = [];
let listLoadedAt = 0;
let busy = false;
let editingId = null;
let nameDraft = null;
let pendingConfirm = null;
let refs = {};

let resolveAuthReady;
const authReady = new Promise((resolve) => { resolveAuthReady = resolve; });

const GOOGLE_LOGO = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
    '</svg>';

const SVG_ATTRS = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const PENCIL_ICON = `<svg ${SVG_ATTRS}><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
const TRASH_ICON = `<svg ${SVG_ATTRS}><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;

function el(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.html !== undefined) node.innerHTML = options.html;
    if (options.type) node.type = options.type;
    if (options.title) node.title = options.title;
    if (options.label) node.setAttribute('aria-label', options.label);
    if (options.onClick) node.addEventListener('click', options.onClick);
    children.forEach((child) => child && node.appendChild(child));
    return node;
}

// One link per mode: the cloud graph each mode's local graph was last saved to / opened from.
function readLinks() {
    try {
        return JSON.parse(localStorage.getItem(LINK_KEY)) || {};
    } catch (error) {
        return {};
    }
}

function writeLinks(links) {
    try {
        if (Object.keys(links).length > 0) {
            localStorage.setItem(LINK_KEY, JSON.stringify(links));
        } else {
            localStorage.removeItem(LINK_KEY);
        }
    } catch (error) {
        // Storage can be unavailable (private browsing); links are only a convenience.
    }
}

function activeLink(mode) {
    const link = readLinks()[mode];
    return link && user && link.uid === user.uid ? link : null;
}

function setLink(mode, link) {
    const links = readLinks();
    if (link) {
        links[mode] = link;
    } else {
        delete links[mode];
    }
    writeLinks(links);
}

function snapshotOf(functions) {
    return JSON.stringify((functions || [])
        .filter((func) => func && func.expression && func.expression.trim())
        .map((func) => [func.expression.trim(), func.enabled !== false]));
}

function functionsForMode(mode) {
    if (mode === app.plotMode) {
        return app.getCurrentFunctions();
    }
    const inMemory = mode === 'polar' ? app.polarFunctions : app.cartesianFunctions;
    if (inMemory.length > 0) {
        return inMemory;
    }
    const saved = app.loadFunctionsFromLocalStorage();
    return (mode === 'polar' ? saved.polar : saved.cartesian) || [];
}

// True when loading a graph in `mode` would discard work that isn't already in the cloud.
function hasUnsavedWork(mode) {
    const snapshot = snapshotOf(functionsForMode(mode));
    if (snapshot === '[]') {
        return false;
    }
    const link = activeLink(mode);
    return !(link && link.snap === snapshot);
}

function modeLabel(mode) {
    return mode === 'polar' ? 'Polar' : 'Cartesian';
}

function withTimeout(promise) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), NETWORK_TIMEOUT_MS);
        })
    ]);
}

function describeError(error) {
    const code = (error && error.code) || '';
    if (!navigator.onLine || code === 'timeout' || code === 'unavailable' || code === 'auth/network-request-failed') {
        return 'Can\u2019t reach the cloud. Check your internet connection and try again.';
    }
    if (code === 'permission-denied') {
        return 'Cloud saving isn\u2019t permitted for this account.';
    }
    if (code === 'auth/popup-blocked') {
        return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
    }
    if (code === 'auth/unauthorized-domain') {
        return 'Sign-in isn\u2019t enabled for this web address.';
    }
    return `Something went wrong${code ? ` (${code})` : ''}. Please try again.`;
}

function formatDate(value) {
    if (!value || typeof value.toDate !== 'function') {
        return '';
    }
    return value.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function graphsCollection() {
    return collection(db, 'users', user.uid, 'graphs');
}

function updateIndicator() {
    const button = document.getElementById('cloud-button');
    if (!button) return;
    button.classList.toggle('cloud-signed-in', !!user);
    button.title = user ? `Cloud saves (signed in as ${user.email || 'Google account'})` : 'Cloud saves';
}

function isOpen() {
    return !!(refs.overlay && refs.overlay.classList.contains('show'));
}

function setStatus(text, isError = false) {
    if (!refs.status) return;
    refs.status.textContent = text || '';
    refs.status.classList.toggle('error', !!isError);
}

function clearConfirm(result) {
    if (pendingConfirm) {
        const { resolve } = pendingConfirm;
        pendingConfirm = null;
        resolve(result);
    }
    if (refs.confirm) {
        refs.confirm.replaceChildren();
        refs.confirm.hidden = true;
    }
}

function askConfirm(message, confirmLabel) {
    clearConfirm(false);
    return new Promise((resolve) => {
        pendingConfirm = { resolve };
        refs.confirm.replaceChildren(
            el('div', { text: message }),
            el('div', { className: 'export-actions' }, [
                el('button', { className: 'export-btn', type: 'button', text: 'Cancel', onClick: () => clearConfirm(false) }),
                el('button', { className: 'export-btn primary', type: 'button', text: confirmLabel, onClick: () => clearConfirm(true) })
            ])
        );
        refs.confirm.hidden = false;
    });
}

async function runBusy(task) {
    if (busy) return;
    busy = true;
    try {
        await task();
    } catch (error) {
        console.error('Cloud operation failed:', error);
        setStatus(describeError(error), true);
    } finally {
        busy = false;
    }
}

async function loadGraphs(force = false) {
    if (!user) return false;
    if (!force && listLoadedAt && Date.now() - listLoadedAt < LIST_CACHE_MS) {
        return false;
    }
    setStatus('Loading your graphs\u2026');
    const snapshot = await withTimeout(getDocs(query(graphsCollection(), orderBy('updatedAt', 'desc'))));
    graphs = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            name: String(data.name || 'Untitled'),
            mode: data.mode === 'polar' ? 'polar' : 'cartesian',
            state: data.state,
            updatedAt: data.updatedAt
        };
    });
    listLoadedAt = Date.now();
    setStatus('');
    return true;
}

async function refreshList(force = false) {
    await runBusy(async () => {
        if (await loadGraphs(force)) {
            render();
        }
    });
}

async function handleSignIn(button) {
    button.disabled = true;
    setStatus('');
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        const code = error && error.code;
        if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
            console.error('Sign-in failed:', error);
            setStatus(describeError(error), true);
        }
    } finally {
        button.disabled = false;
    }
}

async function handleSignOut() {
    if (busy) return;
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Sign-out failed:', error);
        setStatus(describeError(error), true);
    }
}

async function saveCurrent(asNew) {
    const name = refs.nameInput.value.trim().replace(/\s+/g, ' ');
    if (!name) {
        setStatus('Enter a name for this graph.', true);
        return;
    }
    if (name.length > NAME_MAX) {
        setStatus(`Names can be up to ${NAME_MAX} characters.`, true);
        return;
    }
    const mode = app.plotMode;
    const snapshot = snapshotOf(app.getCurrentFunctions());
    if (snapshot === '[]') {
        setStatus('Add at least one function before saving.', true);
        return;
    }
    if (typeof LZString === 'undefined') {
        setStatus('Compression library not loaded. Please refresh the page.', true);
        return;
    }

    const link = activeLink(mode);
    const linked = !asNew && link && graphs.some((g) => g.id === link.id) ? link : null;
    const sameName = graphs.find((g) => g.name.toLowerCase() === name.toLowerCase());
    let targetId;

    if (linked) {
        if (sameName && sameName.id !== linked.id) {
            setStatus(`You already have a graph called \u201c${sameName.name}\u201d.`, true);
            return;
        }
        targetId = linked.id;
    } else if (sameName) {
        if (!(await askConfirm(`Replace your existing graph \u201c${sameName.name}\u201d?`, 'Replace'))) {
            return;
        }
        targetId = sameName.id;
    } else {
        if (graphs.length >= MAX_GRAPHS) {
            setStatus(`You can keep up to ${MAX_GRAPHS} saved graphs. Delete one to make room.`, true);
            return;
        }
        targetId = doc(graphsCollection()).id;
    }

    await runBusy(async () => {
        if (!navigator.onLine) {
            throw Object.assign(new Error('offline'), { code: 'unavailable' });
        }
        setStatus('Saving\u2026');
        const compressed = LZString.compressToEncodedURIComponent(app.encodeGraphState());
        await withTimeout(setDoc(doc(db, 'users', user.uid, 'graphs', targetId), {
            name,
            mode,
            state: compressed,
            updatedAt: serverTimestamp()
        }));
        setLink(mode, { uid: user.uid, id: targetId, name, snap: snapshot });
        nameDraft = null;
        await loadGraphs(true);
        render();
        setStatus(`Saved \u201c${name}\u201d.`);
    });
}

async function openGraph(graph) {
    if (busy) return;
    const state = app.decodeGraphState(graph.state);
    if (!state) {
        setStatus('This saved graph couldn\u2019t be read.', true);
        return;
    }
    const mode = state.mode === 'polar' ? 'polar' : 'cartesian';
    if (hasUnsavedWork(mode)) {
        const message = `Open \u201c${graph.name}\u201d? It will replace the ${modeLabel(mode)} graph you\u2019re working on, which isn\u2019t saved to the cloud.`;
        if (!(await askConfirm(message, 'Open'))) {
            return;
        }
    }
    // Written before loading: a shared-link session restarts the page to apply the graph.
    setLink(mode, {
        uid: user.uid,
        id: graph.id,
        name: graph.name,
        snap: snapshotOf(state.functions)
    });
    nameDraft = null;
    close();
    await app.loadCloudGraph(state);
}

async function renameGraph(graph, rawName) {
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (!name || name.length > NAME_MAX) {
        setStatus(name ? `Names can be up to ${NAME_MAX} characters.` : 'Enter a name for this graph.', true);
        return;
    }
    if (name === graph.name) {
        editingId = null;
        render();
        return;
    }
    const clash = graphs.find((g) => g.id !== graph.id && g.name.toLowerCase() === name.toLowerCase());
    if (clash) {
        setStatus(`You already have a graph called \u201c${clash.name}\u201d.`, true);
        return;
    }
    await runBusy(async () => {
        setStatus('Renaming\u2026');
        await withTimeout(updateDoc(doc(db, 'users', user.uid, 'graphs', graph.id), {
            name,
            updatedAt: serverTimestamp()
        }));
        const link = activeLink(graph.mode);
        if (link && link.id === graph.id) {
            setLink(graph.mode, { ...link, name });
        }
        editingId = null;
        await loadGraphs(true);
        render();
    });
}

async function deleteGraph(graph) {
    if (busy) return;
    if (!(await askConfirm(`Delete \u201c${graph.name}\u201d? This can\u2019t be undone.`, 'Delete'))) {
        return;
    }
    await runBusy(async () => {
        setStatus('Deleting\u2026');
        await withTimeout(deleteDoc(doc(db, 'users', user.uid, 'graphs', graph.id)));
        const link = activeLink(graph.mode);
        if (link && link.id === graph.id) {
            setLink(graph.mode, null);
        }
        await loadGraphs(true);
        render();
    });
}

function renderSignedOut() {
    const button = el('button', { className: 'cloud-google-btn', type: 'button', html: `${GOOGLE_LOGO}<span>Sign in with Google</span>` });
    button.addEventListener('click', () => handleSignIn(button));
    return [
        el('p', { className: 'cloud-intro', text: 'Sign in to save your graphs and open them on any device.' }),
        button
    ];
}

function renderRow(graph) {
    const link = activeLink(graph.mode);
    const isCurrent = !!(link && link.id === graph.id);
    const row = el('div', { className: `cloud-row${isCurrent ? ' cloud-row-current' : ''}` });

    if (editingId === graph.id) {
        const input = el('input', { className: 'cloud-input', type: 'text' });
        input.value = graph.name;
        input.maxLength = NAME_MAX;
        input.style.margin = '6px';
        input.setAttribute('aria-label', 'Graph name');
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                renameGraph(graph, input.value);
            }
        });
        row.append(
            input,
            el('button', { className: 'export-btn primary', type: 'button', text: 'Save', onClick: () => renameGraph(graph, input.value) }),
            el('button', {
                className: 'export-btn',
                type: 'button',
                text: 'Cancel',
                onClick: () => { editingId = null; setStatus(''); render(); }
            })
        );
        row.lastChild.style.marginRight = '6px';
        setTimeout(() => input.focus(), 0);
        return row;
    }

    const meta = [modeLabel(graph.mode), formatDate(graph.updatedAt)].filter(Boolean).join(' \u00b7 ');
    const openButton = el('button', { className: 'cloud-row-open', type: 'button', onClick: () => openGraph(graph) }, [
        el('span', { className: 'cloud-row-name', text: graph.name }),
        el('span', { className: 'cloud-row-meta', text: meta })
    ]);
    openButton.title = `Open \u201c${graph.name}\u201d`;
    row.append(
        openButton,
        el('button', {
            className: 'cloud-icon-btn',
            type: 'button',
            html: PENCIL_ICON,
            title: 'Rename',
            label: `Rename ${graph.name}`,
            onClick: () => { editingId = graph.id; setStatus(''); render(); }
        }),
        el('button', {
            className: 'cloud-icon-btn',
            type: 'button',
            html: TRASH_ICON,
            title: 'Delete',
            label: `Delete ${graph.name}`,
            onClick: () => deleteGraph(graph)
        })
    );
    return row;
}

function renderSignedIn() {
    const link = activeLink(app.plotMode);
    const linked = !!(link && graphs.some((g) => g.id === link.id));
    if (nameDraft === null) {
        nameDraft = linked ? link.name : '';
    }

    const input = el('input', { className: 'cloud-input', type: 'text' });
    input.placeholder = 'Name this graph';
    input.maxLength = NAME_MAX;
    input.value = nameDraft;
    input.setAttribute('aria-label', 'Graph name');
    input.addEventListener('input', () => { nameDraft = input.value; });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            saveCurrent(false);
        }
    });
    refs.nameInput = input;

    const saveRow = el('div', { className: 'cloud-save-row' }, [
        input,
        el('button', { className: 'export-btn primary', type: 'button', text: 'Save', onClick: () => saveCurrent(false) })
    ]);

    const saveHint = el('div', { className: 'cloud-row-meta', text: `Saves your current ${modeLabel(app.plotMode)} graph.` });
    saveHint.style.marginTop = '6px';
    const saveGroup = el('div', { className: 'export-group' }, [saveRow, saveHint]);
    if (linked) {
        const asNew = el('button', { className: 'cloud-link-btn', type: 'button', text: 'Save as new', onClick: () => saveCurrent(true) });
        asNew.style.alignSelf = 'flex-start';
        saveGroup.appendChild(asNew);
    }

    const list = el('div', { className: 'cloud-list' });
    if (graphs.length === 0) {
        list.appendChild(el('div', { className: 'cloud-row-meta', text: listLoadedAt ? 'No saved graphs yet.' : '' }));
    } else {
        graphs.forEach((graph) => list.appendChild(renderRow(graph)));
    }

    const listGroup = el('div', { className: 'export-group' }, [
        el('div', { className: 'export-label', text: 'Your graphs' }),
        list
    ]);
    listGroup.style.marginTop = '16px';

    const footer = el('div', { className: 'cloud-footer' }, [
        el('span', { className: 'cloud-footer-email', text: user.email || 'Signed in' }),
        el('button', { className: 'cloud-link-btn', type: 'button', text: 'Sign out', onClick: handleSignOut })
    ]);

    return [saveGroup, refs.status, refs.confirm, listGroup, footer];
}

function render() {
    if (!isOpen()) return;

    refs.status = el('p', { className: 'cloud-status' });
    refs.status.setAttribute('role', 'status');
    refs.confirm = el('div', { className: 'cloud-confirm' });
    refs.confirm.hidden = true;
    if (pendingConfirm) {
        const { resolve } = pendingConfirm;
        pendingConfirm = null;
        resolve(false);
    }

    let content;
    if (!user) {
        content = renderSignedOut();
        content.push(refs.status, refs.confirm);
    } else {
        content = renderSignedIn();
    }
    refs.body.replaceChildren(...content);

    // Avoid popping the on-screen keyboard open on touch devices.
    const canAutoFocusText = window.matchMedia('(pointer: fine)').matches;
    const focusTarget = user ? (canAutoFocusText ? refs.nameInput : null) : refs.body.querySelector('button');
    if (focusTarget && !editingId) {
        focusTarget.focus({ preventScroll: true });
    }
}

function close() {
    if (!isOpen()) return false;
    clearConfirm(false);
    refs.overlay.classList.remove('show');
    editingId = null;
    if (document.activeElement) {
        document.activeElement.blur();
    }
    return true;
}

export function init(appInstance) {
    if (initialised) return;
    initialised = true;
    app = appInstance;

    refs.overlay = document.getElementById('cloud-overlay');
    refs.body = document.getElementById('cloud-body');
    const closeButton = document.getElementById('cloud-close-button');

    refs.overlay.addEventListener('click', (event) => {
        if (event.target === refs.overlay) close();
    });
    closeButton.addEventListener('click', close);
    // Handled here with stopPropagation so the app's own Escape handler doesn't also leave the graph.
    refs.overlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            close();
        }
    });
    app.closeCloudOverlay = close;

    onAuthStateChanged(auth, (nextUser) => {
        const previousUid = user ? user.uid : null;
        user = nextUser;
        try {
            if (user) {
                localStorage.setItem(HINT_KEY, '1');
            } else {
                localStorage.removeItem(HINT_KEY);
            }
        } catch (error) {
            // Hint only drives the indicator dot before this module has loaded.
        }
        if (!user) {
            writeLinks({});
        }
        if ((user ? user.uid : null) !== previousUid) {
            graphs = [];
            listLoadedAt = 0;
            nameDraft = null;
            editingId = null;
        }
        updateIndicator();
        resolveAuthReady();
        if (isOpen()) {
            render();
            if (user) refreshList();
        }
    });
}

export async function open() {
    refs.overlay.classList.add('show');
    refs.body.replaceChildren(el('p', { className: 'cloud-intro', text: 'Loading\u2026' }));
    await authReady;
    if (!isOpen()) return;
    nameDraft = null;
    render();
    if (user) {
        await refreshList();
    }
}
