// Example inputs. Load them from the "Load sample" button, or copy their shape for your own JSON.

export const sampleApartment = {
  building: 'Lotus Heights',
  unit: 'Flat 803',
  location: 'HSR Layout, Bengaluru',
  floor: 8,
  totalFloors: 14,
  facing: 'East',
  furnishing: 'Semi-furnished',
  listing: 'rent', // 'rent' | 'sale'
  price: 38000, // rent per month, or sale price
  deposit: 150000, // deposit (rent) or booking amount (sale)
  contact: 'Ramesh Kulkarni',
  rooms: [
    { name: 'Living & dining', type: 'living_dining', width: 16, length: 18 },
    { name: 'Kitchen', type: 'kitchen', width: 10, length: 10 },
    { name: 'Utility', type: 'utility', width: 5, length: 6 },
    { name: 'Master bedroom', type: 'bedroom', width: 14, length: 12 },
    { name: 'Bathroom 1', type: 'bathroom', width: 8, length: 6 },
    { name: 'Bedroom 2', type: 'bedroom', width: 12, length: 11 },
    { name: 'Bathroom 2', type: 'bathroom', width: 7, length: 6 },
    { name: 'Balcony', type: 'balcony', width: 14, length: 5 },
  ],
};

const statuses = ['available', 'available', 'sold', 'available', 'hold', 'available', 'sold', 'available'];
const facings = ['North', 'South'];

export const samplePlots = {
  name: 'Green Valley Layout',
  location: 'Sarjapur Road, Bengaluru',
  approval: 'BMRDA approved',
  mainRoad: 40,
  internalRoad: 30,
  contact: 'Site office',
  plots: Array.from({ length: 24 }, (_, i) => {
    const big = i % 6 === 5;
    const w = big ? 40 : 30;
    const d = big ? 60 : 40;
    const rate = 4200 + (i % 4) * 150; // ₹ per sq ft
    return {
      id: String(i + 1),
      width: w,
      depth: d,
      facing: facings[Math.floor(i / 6) % 2],
      price: Math.round((w * d * rate) / 10000) * 10000,
      status: statuses[i % statuses.length],
    };
  }),
  amenities: [
    { name: 'Park', type: 'park', width: 80, depth: 60 },
    { name: 'Clubhouse', type: 'clubhouse', width: 50, depth: 40 },
    { name: 'Overhead tank', type: 'water', width: 20, depth: 20 },
  ],
};
