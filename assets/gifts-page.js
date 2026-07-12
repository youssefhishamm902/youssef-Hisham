(() => {
  'use strict';

  const BONUS_COLOR = 'black';
  const BONUS_SIZE = 'medium';
  const BONUS_SUCCESS_MESSAGE = 'Added to cart with the Soft Winter Jacket.';
  const DEFAULT_SUCCESS_MESSAGE = 'Added to cart.';
  const DEFAULT_ERROR_MESSAGE = 'The item could not be added.';
  const BUTTON_RESET_DELAY = 1400;

  const SELECTORS = {
    popup: '[data-gift-popup]',
    open: '[data-gift-popup-open]',
    close: '[data-gift-popup-close]',
    form: '[data-gift-product-form]',
    variants: '[data-gift-variants]',
    optionGroup: '[data-gift-option-group]',
    optionButton: '[data-gift-option-value]',
    optionSelect: '[data-gift-option-select]',
    variantId: '[data-gift-variant-id]',
    price: '[data-gift-popup-price]',
    image: '[data-gift-popup-image]',
    addButton: '[data-gift-add-button]',
    addLabel: '[data-gift-add-label]',
    status: '[data-gift-status]',
    grid: '[data-gifts-grid]',
    cartIcon: 'cart-icon',
    cartCount: '[data-cart-count], .cart-count-bubble span[aria-hidden="true"], .cart-bubble__text-count',
  };

  /**
   * @typedef {{
   *   id: number | string,
   *   available?: boolean,
   *   price?: number | string,
   *   options?: Array<string | number>,
   *   featured_image?: { src?: string, url?: string } | null
   * }} GiftVariant
   *
   * @typedef {HTMLElement & {
   *   renderCartBubble?: (itemCount: number, animate?: boolean) => void
   * }} GiftCartIcon
   *
   * @typedef {{ item_count?: number }} ShopifyCart
   *
   * @typedef {{
   *   cart_add_url?: string,
   *   cart_url?: string
   * }} ThemeRoutes
   *
   * @typedef {{ routes?: ThemeRoutes }} ThemeWithRoutes
   *
   * @typedef {{
   *   routes?: { root?: string },
   *   currency?: { active?: string },
   *   locale?: string
   * }} ShopifyWithOptionalRoutes
   */

  const giftsWindow = /** @type {Window & { GiftsPageInitialized?: boolean }} */ (window);
  if (giftsWindow.GiftsPageInitialized) return;
  giftsWindow.GiftsPageInitialized = true;

  /** @type {HTMLElement | null} */
  let activePopup = null;
  /** @type {HTMLElement | null} */
  let activeTrigger = null;
  /** @type {WeakMap<HTMLElement, GiftVariant[]>} */
  const variantCache = new WeakMap();

  /**
   * @param {unknown} value
   * @returns {string}
   */
  const normalize = (value) => String(value || '').trim().toLowerCase();

  /**
   * @returns {ThemeRoutes}
   */
  function getThemeRoutes() {
    const theme = /** @type {typeof globalThis & { Theme?: ThemeWithRoutes }} */ (globalThis).Theme;
    return theme?.routes || {};
  }

  /**
   * @returns {ShopifyWithOptionalRoutes}
   */
  function getShopify() {
    return /** @type {Window & { Shopify?: ShopifyWithOptionalRoutes }} */ (window).Shopify || {};
  }

  /**
   * @param {Element} element
   * @returns {element is HTMLElement}
   */
  function isHTMLElement(element) {
    return element instanceof HTMLElement;
  }

  /**
   * @param {Element} element
   * @returns {element is HTMLElement}
   */
  function isVisibleHTMLElement(element) {
    return element instanceof HTMLElement && element.offsetParent !== null;
  }

  /**
   * @returns {string}
   */
  function getCartAddUrl() {
    const routes = getThemeRoutes();
    if (routes.cart_add_url) return routes.cart_add_url;

    return `${getShopifyRoot()}cart/add.js`;
  }

  /**
   * @returns {string}
   */
  function getCartUrl() {
    const routes = getThemeRoutes();
    if (routes.cart_url) return `${routes.cart_url}.js`;

    return `${getShopifyRoot()}cart.js`;
  }

  /**
   * @returns {string}
   */
  function getShopifyRoot() {
    const shopify = getShopify();
    const root = shopify?.routes?.root || '/';
    return root.endsWith('/') ? root : `${root}/`;
  }

  /**
   * @param {Element} popup
   * @returns {HTMLElement | null}
   */
  function getGrid(popup) {
    const section = popup.closest('.shopify-section');
    return section ? section.querySelector(SELECTORS.grid) : document.querySelector(SELECTORS.grid);
  }

  /**
   * @param {HTMLElement} popup
   * @returns {GiftVariant[]}
   */
  function readVariants(popup) {
    if (variantCache.has(popup)) return variantCache.get(popup) || [];

    const script = popup.querySelector(SELECTORS.variants);
    if (!script) {
      variantCache.set(popup, []);
      return [];
    }

    try {
      const variants = JSON.parse(script.textContent || '[]');
      const normalizedVariants = Array.isArray(variants) ? variants : [];
      variantCache.set(popup, normalizedVariants);
      return normalizedVariants;
    } catch (error) {
      console.error('[gifts-page] Unable to read product variants.', error);
      variantCache.set(popup, []);
      return [];
    }
  }

  /**
   * @param {HTMLElement} popup
   * @returns {string[]}
   */
  function getSelectedOptions(popup) {
    return Array.from(popup.querySelectorAll(SELECTORS.optionGroup))
      .filter(isHTMLElement)
      .sort((first, second) => Number(first.dataset.optionPosition || 0) - Number(second.dataset.optionPosition || 0))
      .map((group) => {
        const pressedButton = group.querySelector(`${SELECTORS.optionButton}[aria-pressed="true"]`);
        if (pressedButton instanceof HTMLElement) return pressedButton.dataset.giftOptionValue || '';

        const select = group.querySelector(SELECTORS.optionSelect);
        return select instanceof HTMLSelectElement ? select.value : '';
      });
  }

  /**
   * @param {HTMLElement} popup
   * @returns {GiftVariant | null}
   */
  function findSelectedVariant(popup) {
    const selectedOptions = getSelectedOptions(popup);
    const variants = readVariants(popup);

    if (selectedOptions.length === 0) {
      return variants.find((variant) => variant.available) || variants[0] || null;
    }

    return (
      variants.find((variant) => {
        if (!Array.isArray(variant.options) || variant.options.length !== selectedOptions.length) return false;

        return variant.options.every((option, index) => normalize(option) === normalize(selectedOptions[index]));
      }) || null
    );
  }

  /**
   * @param {number | string | undefined} cents
   * @param {HTMLElement | null} grid
   * @returns {string}
   */
  function formatMoney(cents, grid) {
    const shopify = getShopify();
    const currency = grid?.dataset.currency || shopify?.currency?.active || 'USD';
    const locale = grid?.dataset.locale || shopify?.locale || document.documentElement.lang || 'en';
    const amount = Number(cents || 0) / 100;

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
      }).format(amount);
    } catch (_error) {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }

  /**
   * @param {GiftVariant | null} variant
   * @returns {string}
   */
  function variantImageUrl(variant) {
    if (!variant?.featured_image) return '';

    const source = variant.featured_image.src || variant.featured_image.url || '';
    return source.startsWith('//') ? `https:${source}` : source;
  }

  /**
   * @param {Element} popup
   * @param {string} [message]
   * @param {'error' | 'success' | ''} [type]
   */
  function setStatus(popup, message = '', type = '') {
    const status = popup.querySelector(SELECTORS.status);
    if (!status) return;

    status.textContent = message;
    status.classList.toggle('is-error', type === 'error');
    status.classList.toggle('is-success', type === 'success');
  }

  /**
   * @param {HTMLElement} popup
   * @returns {GiftVariant | null}
   */
  function updateVariant(popup) {
    const variant = findSelectedVariant(popup);
    const grid = getGrid(popup);
    const idInput = popup.querySelector(SELECTORS.variantId);
    const price = popup.querySelector(SELECTORS.price);
    const image = popup.querySelector(SELECTORS.image);
    const addButton = popup.querySelector(SELECTORS.addButton);
    const addLabel = popup.querySelector(SELECTORS.addLabel);

    setStatus(popup);

    if (!variant) {
      if (idInput instanceof HTMLInputElement) idInput.value = '';
      if (addButton instanceof HTMLButtonElement) addButton.disabled = true;
      if (addLabel) addLabel.textContent = 'UNAVAILABLE';
      return null;
    }

    if (idInput instanceof HTMLInputElement) idInput.value = String(variant.id || '');
    if (price) price.textContent = formatMoney(variant.price, grid);

    const imageUrl = variantImageUrl(variant);
    if (image instanceof HTMLImageElement && imageUrl) {
      image.src = imageUrl;
      image.removeAttribute('srcset');
    }

    if (addButton instanceof HTMLButtonElement) addButton.disabled = !variant.available;
    if (addLabel) addLabel.textContent = variant.available ? 'ADD TO CART' : 'SOLD OUT';

    return variant;
  }

  /**
   * @param {HTMLElement} trigger
   */
  function openPopup(trigger) {
    const popupId = trigger.dataset.giftPopupOpen;
    const popup = popupId ? document.getElementById(popupId) : null;
    if (!popup) return;

    if (activePopup && activePopup !== popup) closePopup(activePopup, false);

    activePopup = popup;
    activeTrigger = trigger;

    popup.classList.add('is-open');
    popup.setAttribute('aria-hidden', 'false');
    document.body.classList.add('gift-popup-open');
    updateVariant(popup);

    const closeButton = popup.querySelector(SELECTORS.close);
    window.requestAnimationFrame(() => {
      if (closeButton instanceof HTMLElement) closeButton.focus();
    });
  }

  /**
   * @param {HTMLElement | null} [popup]
   * @param {boolean} [restoreFocus]
   */
  function closePopup(popup = activePopup, restoreFocus = true) {
    if (!popup) return;

    popup.classList.remove('is-open');
    popup.setAttribute('aria-hidden', 'true');
    setStatus(popup);

    if (activePopup === popup) {
      document.body.classList.remove('gift-popup-open');
      if (restoreFocus && activeTrigger?.isConnected) activeTrigger.focus();

      activePopup = null;
      activeTrigger = null;
    }
  }

  /**
   * @param {HTMLElement} button
   */
  function handleOptionButton(button) {
    const group = button.closest(SELECTORS.optionGroup);
    const popup = button.closest(SELECTORS.popup);
    if (!group || !(popup instanceof HTMLElement)) return;

    group.querySelectorAll(SELECTORS.optionButton).forEach((optionButton) => {
      optionButton.setAttribute('aria-pressed', String(optionButton === button));
    });

    updateVariant(popup);
  }

  /**
   * @param {GiftVariant | null} variant
   * @returns {boolean}
   */
  function variantTriggersBonus(variant) {
    if (!Array.isArray(variant?.options)) return false;

    const values = variant.options.map(normalize);
    return values.includes(BONUS_COLOR) && values.includes(BONUS_SIZE);
  }

  /**
   * @param {HTMLElement | null} grid
   * @param {HTMLElement} popup
   * @param {GiftVariant} variant
   * @returns {{ id: number, quantity: number } | null}
   */
  function getBonusItem(grid, popup, variant) {
    const bonusVariantId = Number(grid?.dataset.bonusVariantId || 0);
    const bonusProductHandle = normalize(grid?.dataset.bonusProductHandle);
    const currentProductHandle = normalize(popup.dataset.productHandle);

    if (
      !variantTriggersBonus(variant) ||
      bonusVariantId <= 0 ||
      !bonusProductHandle ||
      currentProductHandle === bonusProductHandle ||
      bonusVariantId === Number(variant.id)
    ) {
      return null;
    }

    return { id: bonusVariantId, quantity: 1 };
  }

  /**
   * @param {Response} response
   * @returns {Promise<Record<string, string>>}
   */
  async function parseJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch (_error) {
      return {};
    }
  }

  /**
   * @returns {Promise<ShopifyCart>}
   */
  async function fetchCart() {
    const response = await fetch(getCartUrl(), {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });

    if (!response.ok) throw new Error(`Cart refresh failed with status ${response.status}.`);
    return response.json();
  }

  async function updateCartCount() {
    try {
      const cart = await fetchCart();
      const itemCount = Number(cart.item_count || 0);
      const count = itemCount < 100 ? String(itemCount) : '';

      document.querySelectorAll(SELECTORS.cartCount).forEach((element) => {
        element.textContent = count;
        element.classList.toggle('hidden', itemCount === 0);
      });

      document.querySelectorAll(SELECTORS.cartIcon).forEach((cartIcon) => {
        const icon = /** @type {GiftCartIcon} */ (cartIcon);
        icon.classList.toggle('header-actions__cart-icon--has-cart', itemCount > 0);

        if (typeof icon.renderCartBubble === 'function') {
          icon.renderCartBubble(itemCount);
        }
      });

      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart } }));
    } catch (error) {
      console.warn('[gifts-page] Cart count could not be refreshed.', error);
    }
  }

  /**
   * @param {HTMLButtonElement} addButton
   * @param {Element} addLabel
   * @param {boolean} isLoading
   */
  function setButtonLoading(addButton, addLabel, isLoading) {
    addButton.disabled = isLoading;
    addButton.toggleAttribute('aria-busy', isLoading);
    if (isLoading) addLabel.textContent = 'ADDING...';
  }

  /**
   * @param {HTMLElement} popup
   * @param {HTMLButtonElement} addButton
   * @param {Element} addLabel
   * @param {string} fallbackLabel
   */
  function resetAddButton(popup, addButton, addLabel, fallbackLabel) {
    addButton.removeAttribute('aria-busy');

    if (popup.isConnected) {
      updateVariant(popup);
    } else {
      addButton.disabled = false;
      addLabel.textContent = fallbackLabel;
    }
  }

  /**
   * @param {HTMLFormElement} form
   */
  async function addToCart(form) {
    const popup = form.closest(SELECTORS.popup);
    if (!(popup instanceof HTMLElement)) return;

    const grid = getGrid(popup);
    const variant = findSelectedVariant(popup);
    const addButton = popup.querySelector(SELECTORS.addButton);
    const addLabel = popup.querySelector(SELECTORS.addLabel);

    if (!variant?.available || !(addButton instanceof HTMLButtonElement) || !addLabel) return;

    const originalLabel = addLabel.textContent || 'ADD TO CART';
    const items = [{ id: Number(variant.id), quantity: 1 }];
    const bonusItem = getBonusItem(grid, popup, variant);
    if (bonusItem) items.push(bonusItem);

    setButtonLoading(addButton, addLabel, true);
    setStatus(popup);

    try {
      const response = await fetch(getCartAddUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ items }),
        credentials: 'same-origin',
      });
      const result = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(result.description || result.message || DEFAULT_ERROR_MESSAGE);
      }

      addLabel.textContent = 'ADDED';
      setStatus(popup, items.length > 1 ? BONUS_SUCCESS_MESSAGE : DEFAULT_SUCCESS_MESSAGE, 'success');
      await updateCartCount();

      window.setTimeout(() => {
        resetAddButton(popup, addButton, addLabel, originalLabel);
      }, BUTTON_RESET_DELAY);
    } catch (error) {
      resetAddButton(popup, addButton, addLabel, originalLabel);
      setStatus(popup, getErrorMessage(error), 'error');
    }
  }

  /**
   * @param {unknown} error
   * @returns {string}
   */
  function getErrorMessage(error) {
    return error instanceof Error && error.message ? error.message : DEFAULT_ERROR_MESSAGE;
  }

  /**
   * @param {KeyboardEvent} event
   */
  function keepFocusInsidePopup(event) {
    if (event.key !== 'Tab' || !activePopup) return;

    const focusable = Array.from(
      activePopup.querySelectorAll(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter(isVisibleHTMLElement);

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const openButton = event.target.closest(SELECTORS.open);
    if (openButton instanceof HTMLElement) {
      event.preventDefault();
      openPopup(openButton);
      return;
    }

    const closeButton = event.target.closest(SELECTORS.close);
    if (closeButton) {
      event.preventDefault();
      const popup = closeButton.closest(SELECTORS.popup);
      closePopup(popup instanceof HTMLElement ? popup : null);
      return;
    }

    const optionButton = event.target.closest(SELECTORS.optionButton);
    if (optionButton instanceof HTMLElement) {
      event.preventDefault();
      handleOptionButton(optionButton);
    }
  });

  document.addEventListener('change', (event) => {
    if (!(event.target instanceof Element)) return;

    const select = event.target.closest(SELECTORS.optionSelect);
    const popup = select?.closest(SELECTORS.popup);
    if (popup instanceof HTMLElement) updateVariant(popup);
  });

  document.addEventListener('submit', (event) => {
    if (!(event.target instanceof Element)) return;

    const form = event.target.closest(SELECTORS.form);
    if (!(form instanceof HTMLFormElement)) return;

    event.preventDefault();
    addToCart(form);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && activePopup) {
      event.preventDefault();
      closePopup();
      return;
    }

    keepFocusInsidePopup(event);
  });

  document.addEventListener('shopify:section:unload', (event) => {
    if (!(event.target instanceof Element) || !activePopup || !event.target.contains(activePopup)) return;

    closePopup(activePopup, false);
  });
})();
