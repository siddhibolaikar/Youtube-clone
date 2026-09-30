/** Fired by the player's left triple-tap; Comments scrolls/opens and focuses its input. */
export const OPEN_COMMENTS_EVENT = "yourtube:open-comments";

/** Header ☰ button → Sidebar drawer on small screens. */
export const TOGGLE_SIDEBAR_EVENT = "yourtube:toggle-sidebar";

export const requestToggleSidebar = () => window.dispatchEvent(new Event(TOGGLE_SIDEBAR_EVENT));

export const requestOpenComments = () => window.dispatchEvent(new Event(OPEN_COMMENTS_EVENT));
