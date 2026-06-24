export function generateSteveSkin(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const colors = {
    skin: '#dcaa83',
    skinDark: '#c28a5c',
    skinLight: '#ecc5a6',
    hair: '#593d29',
    hairDark: '#3d2a1c',
    eyes: '#4a6b8c',
    mouth: '#8b6b4a',
    shirt: '#4a6ec2',
    shirtDark: '#3a5aaa',
    shirtLight: '#6a8ee2',
    pants: '#2a4a7a',
    pantsDark: '#1a3a6a',
    pantsLight: '#3a6a9a',
    shoe: '#5a5a5a',
    shoeDark: '#3a3a3a',
    transparent: 'rgba(0,0,0,0)',
  };

  // Head front (face) - 8x8 at (8,8)
  // Skin base
  ctx.fillStyle = colors.skin;
  ctx.fillRect(8, 8, 8, 8);
  // Hair
  ctx.fillStyle = colors.hair;
  ctx.fillRect(8, 8, 8, 2);
  // Eyes
  ctx.fillStyle = colors.eyes;
  ctx.fillRect(9, 11, 2, 1);
  ctx.fillRect(13, 11, 2, 1);
  // Mouth
  ctx.fillStyle = colors.mouth;
  ctx.fillRect(10, 14, 4, 1);

  // Head top - 8x8 at (8,0)
  ctx.fillStyle = colors.hair;
  ctx.fillRect(8, 0, 8, 8);

  // Head right (side) - 8x8 at (0,8)
  ctx.fillStyle = colors.skinDark;
  ctx.fillRect(0, 8, 8, 8);
  ctx.fillStyle = colors.hairDark;
  ctx.fillRect(0, 8, 8, 2);

  // Head left (side) - 8x8 at (16,8)
  ctx.fillStyle = colors.skinLight;
  ctx.fillRect(16, 8, 8, 8);
  ctx.fillStyle = colors.hair;
  ctx.fillRect(16, 8, 8, 2);

  // Head bottom - 8x8 at (16,0)
  ctx.fillStyle = colors.hairDark;
  ctx.fillRect(16, 0, 8, 8);

  // Head back - 8x8 at (24,8)
  ctx.fillStyle = colors.skin;
  ctx.fillRect(24, 8, 8, 8);
  ctx.fillStyle = colors.hair;
  ctx.fillRect(24, 8, 8, 2);

  // Body front - 8x12 at (20,20)
  ctx.fillStyle = colors.shirt;
  ctx.fillRect(20, 20, 8, 12);
  // Belt
  ctx.fillStyle = colors.pants;
  ctx.fillRect(20, 28, 8, 4);

  // Body back - 8x12 at (32,20)
  ctx.fillStyle = colors.shirtDark;
  ctx.fillRect(32, 20, 8, 12);
  ctx.fillStyle = colors.pantsDark;
  ctx.fillRect(32, 28, 8, 4);

  // Body right (side) - 4x12 at (16,20)
  ctx.fillStyle = colors.shirtDark;
  ctx.fillRect(16, 20, 4, 12);
  ctx.fillStyle = colors.pantsDark;
  ctx.fillRect(16, 28, 4, 4);

  // Body left (side) - 4x12 at (28,20)
  ctx.fillStyle = colors.shirtLight;
  ctx.fillRect(28, 20, 4, 12);
  ctx.fillStyle = colors.pantsLight;
  ctx.fillRect(28, 28, 4, 4);

  // Body top - 8x4 at (20,16)
  ctx.fillStyle = colors.shirt;
  ctx.fillRect(20, 16, 8, 4);

  // Body bottom - 8x4 at (28,16)
  ctx.fillStyle = colors.pants;
  ctx.fillRect(28, 16, 8, 4);

  // Right arm front - 4x12 at (44,20)
  ctx.fillStyle = colors.shirt;
  ctx.fillRect(44, 20, 4, 12);

  // Right arm back - 4x12 at (52,20)
  ctx.fillStyle = colors.shirtDark;
  ctx.fillRect(52, 20, 4, 12);

  // Right arm top - 4x4 at (44,16)
  ctx.fillStyle = colors.shirt;
  ctx.fillRect(44, 16, 4, 4);

  // Right arm bottom - 4x4 at (48,16)
  ctx.fillStyle = colors.shirt;
  ctx.fillRect(48, 16, 4, 4);

  // Right arm right (outer) - 4x12 at (40,20)
  ctx.fillStyle = colors.shirtDark;
  ctx.fillRect(40, 20, 4, 12);

  // Right arm left (inner) - 4x12 at (48,20)
  ctx.fillStyle = colors.shirtLight;
  ctx.fillRect(48, 20, 4, 12);

  // Left arm front - 4x12 at (36,48)
  ctx.fillStyle = colors.shirt;
  ctx.fillRect(36, 48, 4, 12);

  // Left arm back - 4x12 at (44,48)
  ctx.fillStyle = colors.shirtDark;
  ctx.fillRect(44, 48, 4, 12);

  // Left arm top - 4x4 at (36,44)
  ctx.fillStyle = colors.shirt;
  ctx.fillRect(36, 44, 4, 4);

  // Left arm bottom - 4x4 at (40,44)
  ctx.fillStyle = colors.shirt;
  ctx.fillRect(40, 44, 4, 4);

  // Left arm right (outer) - 4x12 at (32,48)
  ctx.fillStyle = colors.shirtDark;
  ctx.fillRect(32, 48, 4, 12);

  // Left arm left (inner) - 4x12 at (40,48)
  ctx.fillStyle = colors.shirtLight;
  ctx.fillRect(40, 48, 4, 12);

  // Right leg front - 4x12 at (4,20)
  ctx.fillStyle = colors.pants;
  ctx.fillRect(4, 20, 4, 12);
  // Shoe
  ctx.fillStyle = colors.shoe;
  ctx.fillRect(4, 28, 4, 4);

  // Right leg back - 4x12 at (12,20)
  ctx.fillStyle = colors.pantsDark;
  ctx.fillRect(12, 20, 4, 12);
  ctx.fillStyle = colors.shoeDark;
  ctx.fillRect(12, 28, 4, 4);

  // Right leg right (outer) - 4x12 at (0,20)
  ctx.fillStyle = colors.pantsDark;
  ctx.fillRect(0, 20, 4, 12);
  ctx.fillStyle = colors.shoeDark;
  ctx.fillRect(0, 28, 4, 4);

  // Right leg left (inner) - 4x12 at (8,20)
  ctx.fillStyle = colors.pantsLight;
  ctx.fillRect(8, 20, 4, 12);
  ctx.fillStyle = colors.shoe;
  ctx.fillRect(8, 28, 4, 4);

  // Right leg top - 4x4 at (4,16)
  ctx.fillStyle = colors.pants;
  ctx.fillRect(4, 16, 4, 4);

  // Right leg bottom - 4x4 at (8,16)
  ctx.fillStyle = colors.shoe;
  ctx.fillRect(8, 16, 4, 4);

  // Left leg front - 4x12 at (20,48)
  ctx.fillStyle = colors.pants;
  ctx.fillRect(20, 48, 4, 12);
  ctx.fillStyle = colors.shoe;
  ctx.fillRect(20, 56, 4, 4);

  // Left leg back - 4x12 at (28,48)
  ctx.fillStyle = colors.pantsDark;
  ctx.fillRect(28, 48, 4, 12);
  ctx.fillStyle = colors.shoeDark;
  ctx.fillRect(28, 56, 4, 4);

  // Left leg right (outer) - 4x12 at (16,48)
  ctx.fillStyle = colors.pantsDark;
  ctx.fillRect(16, 48, 4, 12);
  ctx.fillStyle = colors.shoeDark;
  ctx.fillRect(16, 56, 4, 4);

  // Left leg left (inner) - 4x12 at (24,48)
  ctx.fillStyle = colors.pantsLight;
  ctx.fillRect(24, 48, 4, 12);
  ctx.fillStyle = colors.shoe;
  ctx.fillRect(24, 56, 4, 4);

  // Left leg top - 4x4 at (20,44)
  ctx.fillStyle = colors.pants;
  ctx.fillRect(20, 44, 4, 4);

  // Left leg bottom - 4x4 at (24,44)
  ctx.fillStyle = colors.shoe;
  ctx.fillRect(24, 44, 4, 4);

  return canvas.toDataURL();
}
