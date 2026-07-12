(() => {
  'use strict';

  const SCRIPT_ID = 'GiftsNavigationScript';
  const DEFAULT_GIFTS_URL = '/pages/gifts';
  const DEFAULT_GIFTS_LABEL = 'Gifts';
  const ACTIVE_CLASS = 'is-active';
  const CONTACT_LABEL = 'contact';
  const MENU_SELECTORS = [
    'header-menu overflow-list',
    '.menu-list--mobile .menu-list__list',
    '.header__inline-menu .list-menu--inline',
    '.menu-drawer__navigation .menu-drawer__menu',
    'nav[aria-label="Primary"] > ul',
    'nav[aria-label="Main navigation"] > ul',
  ];

  const script = document.getElementById(SCRIPT_ID);
  const giftsUrl = getConfiguredValue(script, 'giftsUrl', DEFAULT_GIFTS_URL);
  const giftsLabel = getConfiguredValue(script, 'giftsLabel', DEFAULT_GIFTS_LABEL);
  const normalizedGiftsPath = normalizePath(giftsUrl);

  /**
   * @param {HTMLElement | null} element
   * @param {'giftsUrl' | 'giftsLabel'} key
   * @param {string} fallback
   * @returns {string}
   */
  function getConfiguredValue(element, key, fallback) {
    if (!(element instanceof HTMLElement)) return fallback;

    const value = element.dataset[key];
    return value ? value.trim() : fallback;
  }

  /**
   * @param {string | null | undefined} url
   * @returns {string}
   */
  function normalizePath(url) {
    if (!url) return '';

    try {
      return new URL(url, window.location.origin).pathname.replace(/\/$/, '') || '/';
    } catch (_error) {
      return String(url).split('?')[0].replace(/\/$/, '') || '/';
    }
  }

  /**
   * @param {HTMLAnchorElement} link
   * @returns {boolean}
   */
  function isGiftsLink(link) {
    return (
      link.hasAttribute('data-gifts-route') ||
      normalizePath(link.href || link.getAttribute('href')) === normalizedGiftsPath
    );
  }

  /**
   * @param {Element} menu
   * @returns {HTMLAnchorElement | undefined}
   */
  function getInsertionPoint(menu) {
    return Array.from(menu.querySelectorAll('a')).find(
      (item) => item.textContent.trim().toLowerCase() === CONTACT_LABEL
    );
  }

  /**
   * @param {HTMLAnchorElement | null} referenceLink
   * @returns {HTMLAnchorElement}
   */
  function createLink(referenceLink) {
    const link = document.createElement('a');
    const referenceText = referenceLink?.querySelector('.menu-list__link-title, .menu-drawer__menu-item-text');

    if (referenceLink) link.className = referenceLink.className;

    link.href = giftsUrl;
    link.dataset.giftsRoute = '';

    if (referenceText instanceof HTMLElement) {
      const text = document.createElement('span');
      text.className = referenceText.className;
      text.textContent = giftsLabel;
      link.appendChild(text);
    } else {
      link.textContent = giftsLabel;
    }

    syncActiveState(link);
    return link;
  }

  /**
   * @param {Element} menu
   * @param {HTMLLIElement} listItem
   * @param {HTMLAnchorElement | undefined} insertionPoint
   */
  function insertMenuItem(menu, listItem, insertionPoint) {
    const insertionItem = insertionPoint ? insertionPoint.closest('li') : null;
    const moreSlot = menu.querySelector(':scope > li[slot="more"]');

    if (insertionItem) {
      insertionItem.insertAdjacentElement('afterend', listItem);
    } else if (moreSlot) {
      moreSlot.insertAdjacentElement('beforebegin', listItem);
    } else {
      menu.appendChild(listItem);
    }
  }

  /**
   * @param {Element} menu
   */
  function requestMenuReflow(menu) {
    if (menu.tagName.toLowerCase() !== 'overflow-list') return;

    menu.dispatchEvent(new CustomEvent('reflow', { bubbles: true }));
  }

  /**
   * @param {Element} menu
   */
  function createMenuItem(menu) {
    const existing = Array.from(menu.querySelectorAll('a')).find((link) => isGiftsLink(link));
    if (existing) {
      syncActiveState(existing);
      return;
    }

    const referenceLink = menu.querySelector('a');
    const referenceItem = referenceLink ? referenceLink.closest('li') : null;
    const listItem = document.createElement('li');
    const link = createLink(referenceLink);

    if (referenceItem) listItem.className = referenceItem.className;
    if (referenceItem?.getAttribute('role')) listItem.setAttribute('role', referenceItem.getAttribute('role') || '');

    const insertionPoint = getInsertionPoint(menu);

    listItem.appendChild(link);
    insertMenuItem(menu, listItem, insertionPoint);
    requestMenuReflow(menu);
  }

  /**
   * @param {HTMLAnchorElement} link
   */
  function syncActiveState(link) {
    const isActive = normalizePath(window.location.href) === normalizedGiftsPath;

    link.classList.toggle(ACTIVE_CLASS, isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else if (link.getAttribute('aria-current') === 'page') {
      link.removeAttribute('aria-current');
    }
  }

  function addGiftsLinks() {
    MENU_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach(createMenuItem);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addGiftsLinks, { once: true });
  } else {
    addGiftsLinks();
  }

  document.addEventListener('shopify:section:load', addGiftsLinks);
})();
