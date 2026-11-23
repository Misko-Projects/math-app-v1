// jsdom has no SVG geometry: the kit's island scene measures itself with `getScreenCTM`, which a
// browser always has. Tests that render the island import this file first.

const svg = SVGElement.prototype as { getScreenCTM?: () => DOMMatrix | null };
svg.getScreenCTM ??= () => null;

const dialog = HTMLDialogElement.prototype;
// jsdom versions without the modal dialog API: open and close by the attribute, as a browser does.
dialog.showModal ??= function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
dialog.close ??= function close(this: HTMLDialogElement) {
  this.removeAttribute('open');
};
