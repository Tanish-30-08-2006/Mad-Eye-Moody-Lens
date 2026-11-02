/**
 * ui/lens-button.ts – Factory for creating isolated Moody Lens buttons per post.
 *
 * Creates a lightweight vanilla DOM button mounted inside a shadow root for each post.
 * Does not instantiate React per post, preserving performance in infinite feeds.
 *
 * TODO: Add state-based styling and icons in Phase 5.
 */

export interface LensButtonOptions {
  postId: string;
  onClick: (event: MouseEvent) => void;
}

/**
 * Creates a vanilla button element configured for in-feed post interaction.
 */
export function createLensButton(options: LensButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'moody-lens-btn';
  button.setAttribute('data-post-id', options.postId);
  button.setAttribute('aria-label', 'Scan post with Moody Lens');
  button.title = 'Scan media with Moody Lens';

  // Placeholder button content
  button.innerHTML = `
    <span class="moody-lens-btn-icon">🔍</span>
    <span class="moody-lens-btn-text">Moody Lens</span>
  `;

  button.addEventListener('click', (event) => {
    // Prevent event bubbling so Reddit doesn't interpret this as clicking the post link
    event.stopPropagation();
    event.preventDefault();
    options.onClick(event);
  });

  return button;
}
