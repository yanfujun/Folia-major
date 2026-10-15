import { playerOverlayLayout } from '@/services/playerOverlayLayout';
import { createFoliumRegistry } from './registry';

// src/mods/folium/playerLayout.ts
// Experimental read-only layout. UI mounts through the existing stageLayers slots.

/** A rectangle in viewport CSS pixels; no native element references are exposed. */
export interface PlayerLayoutRect {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

export interface PlayerLayoutObstacle {
    readonly id: string;
    /** Hidden controls retain their interactive reveal hitboxes. */
    readonly kind: 'control' | 'reveal-area';
    readonly rect: PlayerLayoutRect;
}

export interface PlayerLayoutSnapshot {
    readonly bounds: PlayerLayoutRect;
    readonly obstacles: readonly PlayerLayoutObstacle[];
}

export interface PlayerLayoutApi {
    /** Frozen and reference-stable until changed; null outside the live player. */
    get(): PlayerLayoutSnapshot | null;
    /** Geometry changes are coalesced, not delivered on every animation frame. */
    subscribe(listener: () => void): () => void;
}

type Subscription = { id: string; listener: () => void; dispose?: () => void };
// Internal ownership only: mods cannot register/modify native obstacles through this registry.
export const playerLayoutSubscriptions = createFoliumRegistry<Subscription>('player.layout', {
    validate: (def) => {
        if (typeof def.listener !== 'function') throw new Error('player.layout.subscribe: listener must be a function');
        return { id: def.id, listener: def.listener };
    },
    onAdd: ({ def }) => { def.dispose = playerOverlayLayout.source.subscribe(() => def.listener()); },
    onRemove: ({ def }) => def.dispose?.(),
});

let nextSubscription = 0;
export const createPlayerLayoutApi = (modId: string): PlayerLayoutApi => Object.freeze({
    get: playerOverlayLayout.source.get,
    subscribe: (listener: () => void) => playerLayoutSubscriptions.register(modId, {
        id: `subscription-${++nextSubscription}`, listener,
    }).unregister,
});
