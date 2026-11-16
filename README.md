# PropView 3D

Type in an apartment's room sizes, or a plot layout's plots and roads, and get an interactive 3D view like a property-tour app:

- **Apartment mode**: a furnished 3D floor plan generated from room dimensions, a walk-in view for every room, a tower view that highlights the flat's floor, and a price card.
- **Plot layout mode**: plots, roads, a compound wall, a gate, a park, a clubhouse and other amenities, all generated from dimensions. Plots are coloured by status and carry floating price tags. Clicking a plot shows its details and a preview house that fits on it.
- **Booking flow** (front-end demo): Book visit → Visit booked → Costs → Agreement → Pay token → "The flat/plot is yours" with a move-in checklist. **No real payment is made.**

Everything runs in the browser. There's no backend and no API keys. Your inputs are saved in the browser's local storage.

## Requirements

- Node.js 20.19+ or 22.12+ (you have Node installed if `node -v` works)

## Run it

```bash
cd propview-3d
npm install
npm run dev
```

Vite opens the app at http://localhost:5173.

To build a static site you can host anywhere (Netlify, Vercel, S3, IIS…):

```bash
npm run build      # output in dist/
npm run preview    # serve dist/ locally to check it
```

## How to use

1. Pick **Apartment** or **Plot layout** at the top.
2. Fill in the form on the left. All sizes are in **feet**.
3. Press **Generate 3D**, or Ctrl + Enter.
4. In the 3D view:
   - Drag to rotate, scroll to zoom, and right-drag to pan.
   - Apartment: click a room label, a room's floor, or a name in the room list to walk into that room. Use **Building**, **Floor plan** and **Top view** to switch views. In Building view, click the highlighted floor to go inside.
   - Plots: click a plot, a price tag, or a numbered chip to see details and the preview house.
5. **Book visit** / **Reserve** run the booking flow.
6. **Export JSON** saves your inputs. **Import JSON** loads them back, or loads a file you prepared.

## Input format (JSON)

### Apartment

```json
{
  "building": "Lotus Heights",
  "unit": "Flat 803",
  "location": "HSR Layout, Bengaluru",
  "floor": 8,
  "totalFloors": 14,
  "facing": "East",
  "furnishing": "Semi-furnished",
  "listing": "rent",
  "price": 38000,
  "deposit": 150000,
  "contact": "Ramesh Kulkarni",
  "rooms": [
    { "name": "Living & dining", "type": "living_dining", "width": 16, "length": 18 },
    { "name": "Kitchen", "type": "kitchen", "width": 10, "length": 10 },
    { "name": "Master bedroom", "type": "bedroom", "width": 14, "length": 12 },
    { "name": "Bathroom 1", "type": "bathroom", "width": 8, "length": 6 },
    { "name": "Balcony", "type": "balcony", "width": 14, "length": 5 }
  ]
}
```

- `listing`: `"rent"` (price = rent per month, deposit = security deposit) or `"sale"` (price = sale price, deposit = booking amount).
- Room `type` (sets the furniture and floor): `living_dining`, `living`, `dining`, `kitchen`, `bedroom`, `bathroom`, `balcony`, `study`, `utility`, `pooja`, `foyer`, `other`.
- Sizes are 3–80 ft. Rooms are placed **in the order listed**, in rows with a corridor between rows. Balconies attach to the front rooms, with a glass door.

### Plot layout

```json
{
  "name": "Green Valley Layout",
  "location": "Sarjapur Road, Bengaluru",
  "approval": "BMRDA approved",
  "mainRoad": 40,
  "internalRoad": 30,
  "contact": "Site office",
  "plots": [
    { "id": "1", "width": 30, "depth": 40, "facing": "North", "price": 5040000, "status": "available" },
    { "id": "2", "width": 40, "depth": 60, "facing": "South", "price": 10440000, "status": "sold" }
  ],
  "amenities": [
    { "name": "Park", "type": "park", "width": 80, "depth": 60 },
    { "name": "Clubhouse", "type": "clubhouse", "width": 50, "depth": 40 }
  ]
}
```

- Plot `status`: `available`, `hold`, `booked`, `sold`.
- Amenity `type`: `park`, `clubhouse`, `water`, `temple`, `playground`, `parking`, `other`.
- Plots are laid out **in the order listed**, in back-to-back rows with a road on each side. A spine road on the west joins the rows, and the main road runs along the south edge with the entrance gate.
- **Bulk add plots** in the form creates many identical plots at once, with prices computed from a rate per sq ft.

## Project structure

```
propview-3d/
├── index.html            page shell
├── vite.config.js
├── package.json
└── src/
    ├── main.js           app state, panels, events
    ├── style.css
    ├── samples.js        example apartment + layout
    ├── util.js           formatting (₹, lakh/crore), validation, storage
    ├── scene/
    │   ├── core.js       Three.js viewer: camera, lights, picking, labels, helpers
    │   ├── apartment.js  room layout engine, walls/doors/windows, furniture, tower
    │   └── plots.js      plot layout engine, roads, boundary, amenities, preview house
    └── ui/
        ├── forms.js      input forms for both modes
        └── flow.js       visit / reserve / agreement / done screens
```

## Limits and next steps

- The 3D models are **generated from sizes**, so they show the correct layout and proportions, not what the real place looks like. Room positions come from an automatic packing. For an exact floor plan you would add `x`/`z` positions per room. The layout engine in `scene/apartment.js` is the place to add that.
- Plot layouts are arranged on a grid automatically, not traced from a survey drawing.
- The booking, agreement and payment screens are a UI demo. To make them real, connect a backend (for example Supabase or Firebase), a payment gateway (Razorpay), and an e-sign/e-stamp provider.
