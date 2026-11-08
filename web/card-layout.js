// Give short ideas one compact row; let long ideas use the full reading width.
export function fitCards(list) {
  const measure = document.createElement('p');
  Object.assign(measure.style, { position: 'fixed', left: '-10000px', top: '0',
    visibility: 'hidden', margin: '0', padding: '0', border: '0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
  document.body.append(measure);
  for (const row of list.children) {
    const face = row.querySelector('.card-face');
    const text = row.querySelector('.card-copy p');
    if (!face || !text) continue;
    const style = getComputedStyle(face);
    const type = getComputedStyle(text);
    const width = face.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      - 32 - 72 - 2 * parseFloat(style.columnGap);
    Object.assign(measure.style, { width: Math.max(1, width) + 'px', fontFamily: type.fontFamily,
      fontSize: type.fontSize, fontWeight: type.fontWeight, lineHeight: type.lineHeight, letterSpacing: type.letterSpacing });
    measure.textContent = text.textContent;
    row.classList.toggle('card--long', measure.offsetHeight > parseFloat(type.lineHeight) * 2 + 1);
  }
  measure.remove();
}

export function watchCardWidth(list) {
  let width = 0;
  const observer = new ResizeObserver(entries => {
    const next = entries[0].contentRect.width;
    if (next !== width) { width = next; fitCards(list); }
  });
  observer.observe(list);
}
