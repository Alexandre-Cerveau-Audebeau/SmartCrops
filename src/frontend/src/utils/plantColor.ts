export function getPlantColor(plantId: string): string {
  let hash = 0;
  for (let i = 0; i < plantId.length; i++) hash = plantId.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 80%)`;
}
