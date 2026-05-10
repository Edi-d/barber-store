// The Shop tab IS the marketplace home. Re-exporting the component (rather
// than redirecting to /marketplace) keeps it inside the (tabs) group, so the
// tab bar persists and there's no slide-in animation. Sub-pages like
// /marketplace/cart remain top-level stack screens that intentionally slide
// in over the tabs.
export { default } from '../marketplace/index';
