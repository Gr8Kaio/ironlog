/**
 * Semilla de la biblioteca de alimentos.
 *
 * Tres fuentes, y cada fila dice de cual salio, para que cualquier numero se
 * pueda auditar en vez de tener que confiar en el:
 *
 *  1. USDA FoodData Central, SR Legacy (dominio publico) para los basicos
 *     universales. Elegidos por `fdcId` uno por uno: el primer resultado de
 *     una busqueda devuelve el corte equivocado mas seguido de lo aceptable.
 *  2. ARGENFOODS (Universidad Nacional de Lujan, capitulo argentino de
 *     LATINFOODS/FAO) para cortes y productos argentinos, que ninguna tabla
 *     internacional tiene bien. Se cita tabla y numero de fila.
 *  3. Etiquetas de fabricantes para productos de marca, con los valores tal
 *     cual los imprime el envase y `refAmount` igual a la porcion declarada.
 *
 * Y una cuarta categoria aparte: los platos compuestos (milanesa, empanada,
 * medialuna) no existen en ninguna tabla de composicion, porque dependen de
 * la receta. Se calculan sumando componentes ya citados y llevan la receta
 * escrita en `source`. Son estimaciones: ajustalas a como cocinas vos, en vez
 * de creerles. La mas sensible de todas es el aceite que absorbe un frito.
 *
 * Salvo que el nombre diga otra cosa, los valores son de producto CRUDO y por
 * 100 g. Pesar en crudo es lo unico reproducible: lo que cambia al cocinar es
 * el agua, no los macros.
 */
import type { Food } from './types';
import { db, newId } from './db';

export interface SeedFood {
  slug: string;
  name: string;
  brand?: string;
  refAmount: number;
  refUnit: 'g' | 'ml' | 'unit';
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  portions: { label: string; amount: number }[];
  source: string;
}

export const SEED_FOODS: SeedFood[] = [
  { slug: 'pechuga-pollo', name: 'Pechuga de pollo (cruda)', refAmount: 100, refUnit: 'g',
    kcal: 120, proteinG: 22.5, carbsG: 0, fatG: 2.6, fiberG: 0,
    portions: [{ label: 'porcion', amount: 150 }],
    source: 'USDA SR Legacy #171077 - Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw' },
  { slug: 'carne-picada', name: 'Carne picada 90/10 (cruda)', refAmount: 100, refUnit: 'g',
    kcal: 176, proteinG: 20, carbsG: 0, fatG: 10, fiberG: 0,
    portions: [{ label: 'porcion', amount: 150 }],
    source: 'USDA SR Legacy #174030 - Beef, ground, 90% lean meat / 10% fat, raw' },
  { slug: 'salmon', name: 'Salmon (crudo)', refAmount: 100, refUnit: 'g',
    kcal: 208, proteinG: 20.4, carbsG: 0, fatG: 13.4, fiberG: 0,
    portions: [{ label: 'porcion', amount: 150 }],
    source: 'USDA SR Legacy #175167 - Fish, salmon, Atlantic, farmed, raw' },
  { slug: 'costeleta-cerdo', name: 'Costeleta de cerdo (cruda, sin hueso)', refAmount: 100, refUnit: 'g',
    kcal: 170, proteinG: 20.7, carbsG: 0, fatG: 9, fiberG: 0,
    portions: [{ label: 'costeleta', amount: 180 }],
    source: 'USDA SR Legacy #168238 - Pork, fresh, loin, center loin (chops), bone-in, separable lean and fat, raw' },
  // Variantes "con hueso": el valor sin hueso por la parte comestible, segun el
  // refuse (desperdicio) que publica USDA SR28 para ese corte. Son para pesar la
  // pieza entera cruda, que es como se pesa en casa.
  { slug: 'costeleta-cerdo-hueso', name: 'Costeleta de cerdo (cruda, con hueso)', refAmount: 100, refUnit: 'g',
    kcal: 127.5, proteinG: 15.5, carbsG: 0, fatG: 6.8, fiberG: 0,
    portions: [{ label: 'costeleta', amount: 240 }],
    source: 'Costeleta sin hueso x 0.75: USDA SR28 #10036 refuse 25% (hueso 14%, tejido conectivo 11%)' },
  { slug: 'atun-agua', name: 'Atun al agua (lata escurrida)', refAmount: 1, refUnit: 'unit',
    kcal: 139.2, proteinG: 30.6, carbsG: 0, fatG: 1, fiberG: 0,
    portions: [],
    source: 'USDA SR Legacy #171986 - Fish, tuna, light, canned in water, without salt, drained so | 1 unidad = 120 g' },
  { slug: 'huevo', name: 'Huevo', refAmount: 1, refUnit: 'unit',
    kcal: 71.5, proteinG: 6.3, carbsG: 0.4, fatG: 4.8, fiberG: 0,
    portions: [],
    source: 'USDA SR Legacy #171287 - Egg, whole, raw, fresh | 1 unidad = 50 g' },
  { slug: 'arroz', name: 'Arroz blanco (crudo)', refAmount: 100, refUnit: 'g',
    kcal: 365, proteinG: 7.1, carbsG: 80, fatG: 0.7, fiberG: 1.3,
    portions: [{ label: 'taza cruda', amount: 185 }],
    source: 'USDA SR Legacy #169756 - Rice, white, long-grain, regular, raw, unenriched' },
  { slug: 'avena', name: 'Avena', refAmount: 100, refUnit: 'g',
    kcal: 379, proteinG: 13.2, carbsG: 67.7, fatG: 6.5, fiberG: 10.1,
    portions: [{ label: 'taza', amount: 81 }],
    source: 'USDA SR Legacy #173904 - Cereals, oats, regular and quick, not fortified, dry' },
  { slug: 'fideos', name: 'Fideos secos', refAmount: 100, refUnit: 'g',
    kcal: 371, proteinG: 13, carbsG: 74.7, fatG: 1.5, fiberG: 3.2,
    portions: [{ label: 'plato crudo', amount: 100 }],
    source: 'USDA SR Legacy #168927 - Pasta, dry, unenriched' },
  { slug: 'polenta', name: 'Polenta (seca)', refAmount: 100, refUnit: 'g',
    kcal: 370, proteinG: 7.1, carbsG: 79.5, fatG: 1.8, fiberG: 3.9,
    portions: [],
    source: 'USDA SR Legacy #168867 - Cornmeal, degermed, enriched, yellow' },
  { slug: 'harina', name: 'Harina 0000', refAmount: 100, refUnit: 'g',
    kcal: 364, proteinG: 10.3, carbsG: 76.3, fatG: 1, fiberG: 2.7,
    portions: [],
    source: 'USDA SR Legacy #169761 - Wheat flour, white, all-purpose, unenriched' },
  { slug: 'pan-integral', name: 'Pan integral (rebanada)', refAmount: 1, refUnit: 'unit',
    kcal: 70.6, proteinG: 3.5, carbsG: 12, fatG: 1, fiberG: 1.7,
    portions: [],
    source: 'USDA SR Legacy #172688 - Bread, whole-wheat, commercially prepared | 1 unidad = 28 g' },
  { slug: 'lentejas', name: 'Lentejas (secas)', refAmount: 100, refUnit: 'g',
    kcal: 352, proteinG: 24.6, carbsG: 63.4, fatG: 1.1, fiberG: 10.7,
    portions: [],
    source: 'USDA SR Legacy #172420 - Lentils, raw' },
  { slug: 'garbanzos', name: 'Garbanzos (secos)', refAmount: 100, refUnit: 'g',
    kcal: 378, proteinG: 20.5, carbsG: 63, fatG: 6, fiberG: 12.2,
    portions: [],
    source: 'USDA SR Legacy #173756 - Chickpeas (garbanzo beans, bengal gram), mature seeds, raw' },
  { slug: 'papa', name: 'Papa (cruda)', refAmount: 100, refUnit: 'g',
    kcal: 77, proteinG: 2, carbsG: 17.5, fatG: 0.1, fiberG: 2.1,
    portions: [{ label: 'mediana', amount: 173 }],
    source: 'USDA SR Legacy #170026 - Potatoes, flesh and skin, raw' },
  { slug: 'batata', name: 'Batata (cruda)', refAmount: 100, refUnit: 'g',
    kcal: 86, proteinG: 1.6, carbsG: 20.1, fatG: 0.1, fiberG: 3,
    portions: [{ label: 'mediana', amount: 130 }],
    source: 'USDA SR Legacy #168482 - Sweet potato, raw, unprepared (Includes foods for USDA\'s Food Distribu' },
  { slug: 'banana', name: 'Banana', refAmount: 1, refUnit: 'unit',
    kcal: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4, fiberG: 3.1,
    portions: [],
    source: 'USDA SR Legacy #173944 - Bananas, raw | 1 unidad = 118 g' },
  { slug: 'manzana', name: 'Manzana', refAmount: 1, refUnit: 'unit',
    kcal: 103.7, proteinG: 0.5, carbsG: 24.8, fatG: 0.3, fiberG: 4.4,
    portions: [],
    source: 'USDA SR Legacy #168202 - Apples, raw, golden delicious, with skin | 1 unidad = 182 g' },
  { slug: 'palta', name: 'Palta', refAmount: 100, refUnit: 'g',
    kcal: 160, proteinG: 2, carbsG: 8.5, fatG: 14.7, fiberG: 6.7,
    portions: [{ label: 'media', amount: 100 }, { label: 'entera', amount: 200 }],
    source: 'USDA SR Legacy #171705 - Avocados, raw, all commercial varieties' },
  { slug: 'tomate', name: 'Tomate', refAmount: 100, refUnit: 'g',
    kcal: 18, proteinG: 0.9, carbsG: 3.9, fatG: 0.2, fiberG: 1.2,
    portions: [{ label: 'mediano', amount: 123 }],
    source: 'USDA SR Legacy #170457 - Tomatoes, red, ripe, raw, year round average' },
  { slug: 'cebolla', name: 'Cebolla', refAmount: 100, refUnit: 'g',
    kcal: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1, fiberG: 1.7,
    portions: [{ label: 'mediana', amount: 110 }],
    source: 'USDA SR Legacy #170000 - Onions, raw' },
  { slug: 'zanahoria', name: 'Zanahoria', refAmount: 100, refUnit: 'g',
    kcal: 41, proteinG: 0.9, carbsG: 9.6, fatG: 0.2, fiberG: 2.8,
    portions: [{ label: 'mediana', amount: 61 }],
    source: 'USDA SR Legacy #170393 - Carrots, raw' },
  { slug: 'brocoli', name: 'Brocoli', refAmount: 100, refUnit: 'g',
    kcal: 34, proteinG: 2.8, carbsG: 6.6, fatG: 0.4, fiberG: 2.6,
    portions: [{ label: 'taza', amount: 91 }],
    source: 'USDA SR Legacy #170379 - Broccoli, raw' },
  { slug: 'lechuga', name: 'Lechuga', refAmount: 100, refUnit: 'g',
    kcal: 17, proteinG: 1.2, carbsG: 3.3, fatG: 0.3, fiberG: 2.1,
    portions: [{ label: 'plato', amount: 80 }],
    source: 'USDA SR Legacy #169247 - Lettuce, cos or romaine, raw' },
  { slug: 'leche-entera', name: 'Leche entera', refAmount: 100, refUnit: 'g',
    kcal: 61, proteinG: 3.1, carbsG: 4.8, fatG: 3.2, fiberG: 0,
    portions: [{ label: 'vaso', amount: 200 }, { label: 'taza', amount: 250 }],
    source: 'USDA SR Legacy #171265 - Milk, whole, 3.25% milkfat, with added vitamin D' },
  { slug: 'leche-descremada', name: 'Leche descremada', refAmount: 100, refUnit: 'g',
    kcal: 34, proteinG: 3.4, carbsG: 5, fatG: 0.1, fiberG: 0,
    portions: [{ label: 'vaso', amount: 200 }, { label: 'taza', amount: 250 }],
    source: 'USDA SR Legacy #171269 - Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or s' },
  { slug: 'muzzarella', name: 'Muzzarella', refAmount: 100, refUnit: 'g',
    kcal: 299, proteinG: 22.2, carbsG: 2.4, fatG: 22.1, fiberG: 0,
    portions: [{ label: 'feta', amount: 28 }],
    source: 'USDA SR Legacy #170845 - Cheese, mozzarella, whole milk' },
  { slug: 'parmesano', name: 'Queso rallado (parmesano)', refAmount: 100, refUnit: 'g',
    kcal: 420, proteinG: 28.4, carbsG: 13.9, fatG: 27.8, fiberG: 0,
    portions: [{ label: 'cucharada', amount: 5 }],
    source: 'USDA SR Legacy #171247 - Cheese, parmesan, grated' },
  { slug: 'manteca', name: 'Manteca', refAmount: 100, refUnit: 'g',
    kcal: 717, proteinG: 0.8, carbsG: 0.1, fatG: 81.1, fiberG: 0,
    portions: [{ label: 'cucharadita', amount: 5 }],
    source: 'USDA SR Legacy #173430 - Butter, without salt' },
  { slug: 'aceite-oliva', name: 'Aceite de oliva', refAmount: 100, refUnit: 'g',
    kcal: 884, proteinG: 0, carbsG: 0, fatG: 100, fiberG: 0,
    portions: [{ label: 'cucharada', amount: 13.5 }, { label: 'chorrito', amount: 7 }],
    source: 'USDA SR Legacy #171413 - Oil, olive, salad or cooking' },
  // Frutos secos: por 100 g, con una porcion "unidad" que deja cargarlos
  // contados (15 almendras) en vez de pesados. Pesos por unidad de USDA SR28
  // WEIGHT, pelados.
  { slug: 'almendras', name: 'Almendras', refAmount: 100, refUnit: 'g',
    kcal: 579, proteinG: 21.1, carbsG: 21.6, fatG: 49.9, fiberG: 12.5,
    portions: [{ label: 'punado', amount: 28 }, { label: 'unidad', amount: 1.2 }],
    source: 'USDA SR Legacy #170567 - Nuts, almonds | 1 almendra = 1.2 g' },
  { slug: 'mani-tostado', name: 'Mani tostado', refAmount: 100, refUnit: 'g',
    kcal: 587, proteinG: 24.4, carbsG: 21.3, fatG: 49.7, fiberG: 8.4,
    portions: [{ label: 'punado', amount: 28 }, { label: 'unidad', amount: 1 }],
    source: 'USDA SR28 #16390 - Peanuts, all types, dry-roasted, without salt (con sal, #16090, da los mismos macros) | 1 mani = 1.0 g' },
  { slug: 'nueces', name: 'Nueces (peladas)', refAmount: 100, refUnit: 'g',
    kcal: 654, proteinG: 15.2, carbsG: 13.7, fatG: 65.2, fiberG: 6.7,
    portions: [{ label: 'punado', amount: 28 }, { label: 'unidad', amount: 4 }],
    source: 'USDA SR28 #12155 - Nuts, walnuts, english | 7 nueces enteras peladas = 28 g, 1 = 4 g' },
  { slug: 'castanas-caju', name: 'Castanas de caju', refAmount: 100, refUnit: 'g',
    kcal: 574, proteinG: 15.3, carbsG: 32.7, fatG: 46.4, fiberG: 3,
    portions: [{ label: 'punado', amount: 28 }, { label: 'unidad', amount: 1.6 }],
    source: 'USDA SR28 #12585 - Nuts, cashew nuts, dry roasted | 1 unidad = 1.6 g, aproximado: USDA no publica el peso por unidad; ~18 por 28 g segun etiquetas' },
  { slug: 'avellanas', name: 'Avellanas (peladas)', refAmount: 100, refUnit: 'g',
    kcal: 628, proteinG: 15, carbsG: 16.7, fatG: 60.8, fiberG: 9.7,
    portions: [{ label: 'punado', amount: 28 }, { label: 'unidad', amount: 1.4 }],
    source: 'USDA SR28 #12120 - Nuts, hazelnuts or filberts | 10 avellanas = 14 g' },
  { slug: 'pistachos', name: 'Pistachos (pelados)', refAmount: 100, refUnit: 'g',
    kcal: 569, proteinG: 21.1, carbsG: 27.6, fatG: 45.8, fiberG: 10.3,
    portions: [{ label: 'punado', amount: 28 }, { label: 'unidad', amount: 0.7 }],
    source: 'USDA SR28 #12652 - Nuts, pistachio nuts, dry roasted | 1 pistacho sin cascara = 0.7 g' },
  { slug: 'castanas-para', name: 'Castanas de Para', refAmount: 100, refUnit: 'g',
    kcal: 659, proteinG: 14.3, carbsG: 11.7, fatG: 67.1, fiberG: 7.5,
    portions: [{ label: 'punado', amount: 28 }, { label: 'unidad', amount: 5 }],
    source: 'USDA SR28 #12078 - Nuts, brazilnuts, dried, unblanched | 1 castana = 5.0 g' },
  { slug: 'mani-pasta', name: 'Pasta de mani', refAmount: 100, refUnit: 'g',
    kcal: 598, proteinG: 22.2, carbsG: 22.3, fatG: 51.4, fiberG: 5,
    portions: [{ label: 'cucharada', amount: 16 }],
    source: 'USDA SR Legacy #172470 - Peanut butter, smooth style, without salt' },
  { slug: 'miel', name: 'Miel', refAmount: 100, refUnit: 'g',
    kcal: 304, proteinG: 0.3, carbsG: 82.4, fatG: 0, fiberG: 0.2,
    portions: [{ label: 'cucharada', amount: 21 }],
    source: 'USDA SR Legacy #169640 - Honey' },
  { slug: 'azucar', name: 'Azucar', refAmount: 100, refUnit: 'g',
    kcal: 387, proteinG: 0, carbsG: 100, fatG: 0, fiberG: 0,
    portions: [{ label: 'cucharadita', amount: 4 }, { label: 'cucharada', amount: 12 }],
    source: 'USDA SR Legacy #169655 - Sugars, granulated' },
  { slug: 'vacio-crudo', name: 'Vacio de novillito (crudo)', refAmount: 100, refUnit: 'g',
    kcal: 174, proteinG: 22, carbsG: 0, fatG: 11, fiberG: 0,
    portions: [{ label: 'porcion', amount: 200 }],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 517' },
  { slug: 'vacio-parrilla', name: 'Vacio a la parrilla', refAmount: 100, refUnit: 'g',
    kcal: 258, proteinG: 25.6, carbsG: 0, fatG: 17.3, fiberG: 0,
    portions: [{ label: 'porcion', amount: 200 }],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 240' },
  { slug: 'asado-crudo', name: 'Asado / tira de asado (crudo, sin hueso)', refAmount: 100, refUnit: 'g',
    kcal: 170, proteinG: 18.4, carbsG: 0, fatG: 10.7, fiberG: 0,
    portions: [{ label: 'porcion', amount: 250 }],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 226' },
  { slug: 'asado-crudo-hueso', name: 'Asado / tira de asado (crudo, con hueso)', refAmount: 100, refUnit: 'g',
    kcal: 124.1, proteinG: 13.4, carbsG: 0, fatG: 7.8, fiberG: 0,
    portions: [{ label: 'porcion', amount: 340 }],
    source: 'Tira de asado sin hueso x 0.73: USDA SR28 #13147 (Beef, rib, shortribs, raw) refuse 27% hueso' },
  { slug: 'nalga', name: 'Nalga de novillito (cruda)', refAmount: 100, refUnit: 'g',
    kcal: 106, proteinG: 22, carbsG: 0, fatG: 1.7, fiberG: 0,
    portions: [{ label: 'bife', amount: 150 }],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 510' },
  { slug: 'peceto', name: 'Peceto de novillito (crudo)', refAmount: 100, refUnit: 'g',
    kcal: 125, proteinG: 23, carbsG: 0, fatG: 1.9, fiberG: 0,
    portions: [{ label: 'bife', amount: 150 }],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 514' },
  { slug: 'bife-angosto', name: 'Bife angosto de novillito (crudo)', refAmount: 100, refUnit: 'g',
    kcal: 190, proteinG: 21, carbsG: 0, fatG: 12, fiberG: 0,
    portions: [{ label: 'bife', amount: 200 }],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 503' },
  { slug: 'colita-cuadril', name: 'Colita de cuadril (cruda)', refAmount: 100, refUnit: 'g',
    kcal: 143, proteinG: 21, carbsG: 0, fatG: 6.7, fiberG: 0,
    portions: [{ label: 'porcion', amount: 200 }],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 506' },
  { slug: 'paleta', name: 'Paleta de novillito (cruda)', refAmount: 100, refUnit: 'g',
    kcal: 125, proteinG: 19, carbsG: 0, fatG: 5.5, fiberG: 0,
    portions: [{ label: 'porcion', amount: 150 }],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 511' },
  { slug: 'hamburguesa-casera', name: 'Hamburguesa de carne (cruda)', refAmount: 1, refUnit: 'unit',
    kcal: 197.1, proteinG: 15.6, carbsG: 0, fatG: 14.8, fiberG: 0,
    portions: [],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 553 | 1 unidad = 90 g' },
  { slug: 'hamburguesa-light', name: 'Hamburguesa light (cruda)', refAmount: 1, refUnit: 'unit',
    kcal: 157.5, proteinG: 16.6, carbsG: 0, fatG: 10.2, fiberG: 0,
    portions: [],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 555 | 1 unidad = 90 g' },
  { slug: 'chorizo', name: 'Chorizo fresco (crudo)', refAmount: 1, refUnit: 'unit',
    kcal: 454, proteinG: 13, carbsG: 1.1, fatG: 44.2, fiberG: 0,
    portions: [],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 218 | 1 unidad = 100 g' },
  { slug: 'panceta', name: 'Panceta', refAmount: 100, refUnit: 'g',
    kcal: 670, proteinG: 8.3, carbsG: 0, fatG: 70.8, fiberG: 0,
    portions: [{ label: 'feta', amount: 20 }],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 217' },
  { slug: 'jamon-cocido', name: 'Jamon cocido (feta)', refAmount: 1, refUnit: 'unit',
    kcal: 52.8, proteinG: 5.1, carbsG: 0, fatG: 3.6, fiberG: 0,
    portions: [],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 216 | 1 unidad = 25 g' },
  { slug: 'pollo-horno', name: 'Pollo asado al horno (sin hueso)', refAmount: 100, refUnit: 'g',
    kcal: 162, proteinG: 28.4, carbsG: 0, fatG: 5.4, fiberG: 0,
    portions: [{ label: 'porcion', amount: 200 }],
    source: 'ARGENFOODS (UNLu), tabla Carnes y derivados, fila 223' },
  { slug: 'pollo-horno-hueso', name: 'Pollo asado al horno (con hueso)', refAmount: 100, refUnit: 'g',
    kcal: 108.5, proteinG: 19, carbsG: 0, fatG: 3.6, fiberG: 0,
    portions: [{ label: 'porcion', amount: 300 }],
    source: 'Pollo al horno sin hueso x 0.67: USDA SR28 #05009 (Chicken, meat and skin, roasted) refuse 33% hueso' },
  { slug: 'queso-port-salut', name: 'Queso Port Salut', refAmount: 100, refUnit: 'g',
    kcal: 301, proteinG: 20.4, carbsG: 3.7, fatG: 22.7, fiberG: 0,
    portions: [{ label: 'feta', amount: 30 }],
    source: 'ARGENFOODS (UNLu), tabla Leche y derivados, fila 319' },
  { slug: 'queso-sardo', name: 'Queso Sardo', refAmount: 100, refUnit: 'g',
    kcal: 402, proteinG: 30, carbsG: 5, fatG: 29.1, fiberG: 0,
    portions: [{ label: 'cucharada rallado', amount: 5 }],
    source: 'ARGENFOODS (UNLu), tabla Leche y derivados, fila 336' },
  { slug: 'queso-reggianito', name: 'Queso Reggianito', refAmount: 100, refUnit: 'g',
    kcal: 365, proteinG: 33.4, carbsG: 3.4, fatG: 24.2, fiberG: 0,
    portions: [{ label: 'cucharada rallado', amount: 5 }],
    source: 'ARGENFOODS (UNLu), tabla Leche y derivados, fila 335' },
  { slug: 'ricota', name: 'Queso ricota entero', refAmount: 100, refUnit: 'g',
    kcal: 168, proteinG: 11.6, carbsG: 4, fatG: 11.8, fiberG: 0,
    portions: [{ label: 'cucharada', amount: 30 }],
    source: 'ARGENFOODS (UNLu), tabla Leche y derivados, fila 338' },
  // ARGENFOODS fila 551 daba casi lo mismo que la entera (168 kcal, 11.7 g de
  // grasa), imposible para una semidescremada; se reemplaza por USDA.
  { slug: 'ricota-semi', name: 'Queso ricota semidescremado', refAmount: 100, refUnit: 'g',
    kcal: 138, proteinG: 11.4, carbsG: 5.1, fatG: 7.9, fiberG: 0,
    portions: [{ label: 'cucharada', amount: 30 }],
    source: 'USDA SR Legacy #170852 - Cheese, ricotta, part skim milk' },
  { slug: 'dulce-de-leche', name: 'Dulce de leche', refAmount: 100, refUnit: 'g',
    kcal: 314, proteinG: 6.5, carbsG: 57.4, fatG: 6.6, fiberG: 0,
    portions: [{ label: 'cucharada', amount: 20 }],
    source: 'ARGENFOODS (UNLu), tabla Productos azucarados, fila 549' },
  { slug: 'dulce-de-leche-light', name: 'Dulce de leche light', refAmount: 100, refUnit: 'g',
    kcal: 260, proteinG: 6.2, carbsG: 52.9, fatG: 1.6, fiberG: 0,
    portions: [{ label: 'cucharada', amount: 20 }],
    source: 'ARGENFOODS (UNLu), tabla Productos azucarados, fila 546' },
  { slug: 'pan-frances', name: 'Pan frances (mignon)', refAmount: 1, refUnit: 'unit',
    kcal: 188.3, proteinG: 6.5, carbsG: 40.2, fatG: 0.1, fiberG: 0,
    portions: [],
    source: 'ARGENFOODS (UNLu), tabla Cereales y derivados, fila 36 | 1 unidad = 70 g' },
  { slug: 'pan-criollo', name: 'Pan criollo', refAmount: 100, refUnit: 'g',
    kcal: 280, proteinG: 8.7, carbsG: 60.7, fatG: 0.3, fiberG: 0,
    portions: [{ label: 'pan', amount: 60 }],
    source: 'ARGENFOODS (UNLu), tabla Cereales y derivados, fila 39' },
  { slug: 'pan-salvado', name: 'Pan de salvado', refAmount: 100, refUnit: 'g',
    kcal: 235, proteinG: 9.8, carbsG: 51.5, fatG: 1.6, fiberG: 9.2,
    portions: [{ label: 'rebanada', amount: 30 }],
    source: 'ARGENFOODS (UNLu), tabla Cereales y derivados, fila 41' },
  { slug: 'grisines', name: 'Grisin', refAmount: 1, refUnit: 'unit',
    kcal: 20.5, proteinG: 0.8, carbsG: 4.4, fatG: 0, fiberG: 0,
    portions: [],
    source: 'ARGENFOODS (UNLu), tabla Cereales y derivados, fila 31 | 1 unidad = 6 g' },
  { slug: 'galletitas-agua', name: 'Galletita de agua', refAmount: 1, refUnit: 'unit',
    kcal: 26.5, proteinG: 0.8, carbsG: 4.1, fatG: 0.9, fiberG: 0,
    portions: [],
    source: 'ARGENFOODS (UNLu), tabla Cereales y derivados, fila 24 | 1 unidad = 6 g' },
  { slug: 'yogur-griego-natural', name: 'Yogur griego natural (pote)', brand: 'Yogurisimo', refAmount: 1, refUnit: 'unit',
    kcal: 154, proteinG: 12, carbsG: 13, fatG: 6, fiberG: 0,
    portions: [],
    source: 'Etiqueta del fabricante, yogurisimo.com.ar, porcion 190 g = 1 pote' },
  { slug: 'yogur-firme-descremado', name: 'Yogur firme descremado (pote)', brand: 'La Serenisima', refAmount: 1, refUnit: 'unit',
    kcal: 77, proteinG: 8.3, carbsG: 11, fatG: 0, fiberG: 0,
    portions: [],
    source: 'Etiqueta del fabricante, laserenisimanutricion.com.ar, porcion 190 g = 1 pote' },
  { slug: 'galletitas-rumba', name: 'Galletita Rumba', brand: 'Bagley', refAmount: 1, refUnit: 'unit',
    kcal: 64.3, proteinG: 1.2, carbsG: 9.7, fatG: 2.4, fiberG: 0,
    portions: [],
    source: 'Open Food Facts, codigo de barras 7790040930605 - 459 kcal/100 g | 1 galletita = 14 g, estimado' },
  { slug: 'queso-untable-light', name: 'Queso untable light', brand: 'Casancrem', refAmount: 30, refUnit: 'g',
    kcal: 36, proteinG: 2.4, carbsG: 2.8, fatG: 1.7, fiberG: 0,
    portions: [{ label: 'cucharada', amount: 10 }, { label: 'porcion', amount: 30 }],
    source: 'Etiqueta del fabricante, casancrem.com.ar, porcion 30 g' },
  // Solo el polvo: sumale un log aparte de leche-entera o leche-descremada
  // (ya estan en la biblioteca) para la version con leche.
  { slug: 'proteina-star', name: 'Proteina en polvo', brand: 'Star', refAmount: 30, refUnit: 'g',
    kcal: 127, proteinG: 25, carbsG: 2.6, fatG: 1.8, fiberG: 0,
    portions: [{ label: 'scoop', amount: 30 }],
    source: 'Etiqueta del fabricante, porcion 1 scoop = 30 g' },
  { slug: 'batido-proteina-leche-entera', name: 'Batido de proteina con leche entera', brand: 'Star', refAmount: 1, refUnit: 'unit',
    kcal: 249, proteinG: 31.2, carbsG: 12.2, fatG: 8.2, fiberG: 0,
    portions: [],
    source: 'Receta: 1 scoop (30 g) de Proteina en polvo (Star) + 1 vaso (200 g) de leche entera' },
  { slug: 'batido-proteina-leche-descremada', name: 'Batido de proteina con leche descremada', brand: 'Star', refAmount: 1, refUnit: 'unit',
    kcal: 195, proteinG: 31.8, carbsG: 12.6, fatG: 2, fiberG: 0,
    portions: [],
    source: 'Receta: 1 scoop (30 g) de Proteina en polvo (Star) + 1 vaso (200 g) de leche descremada' },
  { slug: 'leche-serenisima-protein', name: 'Leche Protein', brand: 'La Serenisima', refAmount: 100, refUnit: 'ml',
    kcal: 42, proteinG: 5.2, carbsG: 4.6, fatG: 0, fiberG: 0,
    portions: [{ label: 'vaso', amount: 200 }, { label: 'taza', amount: 250 }],
    source: 'Etiqueta del fabricante, valores cada 100 ml' },
  { slug: 'batido-proteina-leche-protein', name: 'Batido de proteina con leche Protein', brand: 'Star + La Serenisima', refAmount: 1, refUnit: 'unit',
    kcal: 211, proteinG: 35.4, carbsG: 11.8, fatG: 1.8, fiberG: 0,
    portions: [],
    source: 'Receta: 1 scoop (30 g) de Proteina en polvo (Star) + 1 vaso (200 ml) de leche La Serenisima Protein' },
  { slug: 'milanesa-carne-frita', name: 'Milanesa de carne (frita)', refAmount: 1, refUnit: 'unit',
    kcal: 346.4, proteinG: 32.8, carbsG: 17.7, fatG: 15.7, fiberG: 0,
    portions: [],
    source: 'Receta estimada: 120 g de nalga cruda + 25 g de pan rallado + 25 g de huevo + 10 g de aceite absorbido. El aceite es la variable grande: ajustalo.' },
  { slug: 'milanesa-carne-horno', name: 'Milanesa de carne (al horno)', refAmount: 1, refUnit: 'unit',
    kcal: 275.6, proteinG: 32.8, carbsG: 17.7, fatG: 7.7, fiberG: 0,
    portions: [],
    source: 'Receta estimada: igual que la frita pero con 2 g de aceite en lugar de 10.' },
  { slug: 'milanesa-pollo-frita', name: 'Milanesa de pollo (frita)', refAmount: 1, refUnit: 'unit',
    kcal: 363.1, proteinG: 33.4, carbsG: 17.7, fatG: 16.7, fiberG: 0,
    portions: [],
    source: 'Receta estimada: 120 g de pechuga cruda + 25 g de pan rallado + 25 g de huevo + 10 g de aceite absorbido.' },
  { slug: 'milanesa-pollo-horno', name: 'Milanesa de pollo (al horno)', refAmount: 1, refUnit: 'unit',
    kcal: 292.4, proteinG: 33.4, carbsG: 17.7, fatG: 8.7, fiberG: 0,
    portions: [],
    source: 'Receta estimada: igual que la frita pero con 2 g de aceite en lugar de 10.' },
  { slug: 'empanada-carne', name: 'Empanada de carne (al horno)', refAmount: 1, refUnit: 'unit',
    kcal: 269.4, proteinG: 11.4, carbsG: 24.4, fatG: 13.5, fiberG: 0,
    portions: [],
    source: 'Receta estimada: tapa de 45 g + 35 g de carne picada + 20 g de cebolla + 5 g de huevo duro + 5 g de grasa. Frita suma ~70 kcal.' },
  { slug: 'medialuna', name: 'Medialuna', refAmount: 1, refUnit: 'unit',
    kcal: 180, proteinG: 2.8, carbsG: 19.2, fatG: 10, fiberG: 0,
    portions: [],
    source: 'Receta estimada: 40 g de masa de factura con manteca.' },
];

export function seedFoodToFood(seed: SeedFood, now: number): Food {
  return {
    id: newId(),
    name: seed.name,
    brand: seed.brand,
    refAmount: seed.refAmount,
    refUnit: seed.refUnit,
    kcal: seed.kcal,
    proteinG: seed.proteinG,
    carbsG: seed.carbsG,
    fatG: seed.fatG,
    fiberG: seed.fiberG,
    portions: seed.portions,
    source: seed.source,
    seedSlug: seed.slug,
    isFavorite: false,
    isArchived: false,
    lastUsedAt: null,
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export interface SeedReport {
  added: number;
  refreshed: number;
}

let seedingFoods: Promise<SeedReport> | null = null;

/**
 * Adds every shipped food the library does not have, and refreshes the ones it
 * does, matched on `seedSlug`.
 *
 * Deliberately not "seed only when the table is empty": this ships into
 * installs that already have history, and a later release that adds a food —
 * or corrects one — has to reach a library that is already populated.
 *
 * A row is only refreshed while `updatedAt === createdAt`, which holds for
 * every seeded row until it is saved through the editor. That is what lets a
 * shipped correction land while a food you fixed yourself is never quietly
 * overwritten. Logging a food does not count as touching it: `touchFood` moves
 * the usage counters and leaves `updatedAt` alone.
 */
export function seedFoodsIfMissing(): Promise<SeedReport> {
  seedingFoods ??= runSeedFoods().finally(() => {
    seedingFoods = null;
  });
  return seedingFoods;
}

async function runSeedFoods(): Promise<SeedReport> {
  const existing = await db.foods.toArray();
  const bySlug = new Map(
    existing.filter((f) => f.seedSlug).map((f) => [f.seedSlug as string, f]),
  );
  const now = Date.now();

  const missing = SEED_FOODS.filter((seed) => !bySlug.has(seed.slug));

  const refreshed: Food[] = [];
  for (const seed of SEED_FOODS) {
    const row = bySlug.get(seed.slug);
    if (!row || row.updatedAt !== row.createdAt) continue;

    const next: Food = {
      ...seedFoodToFood(seed, row.createdAt),
      id: row.id,
      isFavorite: row.isFavorite,
      isArchived: row.isArchived,
      lastUsedAt: row.lastUsedAt,
      useCount: row.useCount,
    };

    const moved =
      row.name !== next.name ||
      row.refUnit !== next.refUnit ||
      row.refAmount !== next.refAmount ||
      row.kcal !== next.kcal ||
      row.proteinG !== next.proteinG ||
      row.carbsG !== next.carbsG ||
      row.fatG !== next.fatG ||
      // Portions too, or a new one (a "unidad" to count almonds by) never
      // reaches an install that already has the food.
      (row.fiberG ?? null) !== next.fiberG ||
      row.source !== next.source ||
      JSON.stringify(row.portions) !== JSON.stringify(next.portions);
    if (moved) refreshed.push(next);
  }

  const writes = [...missing.map((seed) => seedFoodToFood(seed, now)), ...refreshed];
  if (writes.length > 0) await db.foods.bulkPut(writes);
  return { added: missing.length, refreshed: refreshed.length };
}
