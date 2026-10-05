const sizeChart = [
  [145, 155, 40, 50, '56 (5,6 cm)'],
  [150, 160, 45, 55, '58 (5,8 cm)'],
  [155, 165, 50, 60, '60 (6,0 cm)'],
  [155, 170, 55, 70, '62 (6,2 cm)'],
  [160, 175, 65, 80, '64 (6,4 cm)'],
  [160, 180, 75, 90, '66 (6,6 cm)'],
  [165, 185, 85, 100, '68 (6,8 cm)'],
  [165, 190, 95, 110, '70 (7,0 cm)'],
  [170, Infinity, 105, Infinity, '72 (7,2 cm)']
];

export function findSizeSuggestion(text) {
  const height = text.match(/\b(1[4-9]\d|2\d\d)\s*(?:cm|boy(?:um)?)/i)?.[1];
  const weight = text.match(/\b([4-9]\d|1\d\d)\s*(?:kg|kilo(?:yum)?)/i)?.[1];
  if (!height || !weight) return null;
  const match = sizeChart.find(([minH, maxH, minW, maxW]) => Number(height) >= minH && Number(height) <= maxH && Number(weight) >= minW && Number(weight) <= maxW);
  return match ? { height: Number(height), weight: Number(weight), size: match[4] } : null;
}
