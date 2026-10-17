// Búsqueda de emojis en castellano. Los datos de emoji-mart (los mismos que usa
// el editor) solo traen palabras en inglés; este diccionario traduce lo que se
// suele buscar para que «casa» encuentre 🏠 igual que «house».

const ES_EN: Record<string, string> = {
  agua: "water droplet", ajedrez: "chess", alerta: "warning", alien: "alien", altavoz: "speaker loud",
  amarillo: "yellow", amor: "love heart kiss", animal: "animal", arbol: "tree", arcoiris: "rainbow",
  avion: "airplane plane", azul: "blue", bandera: "flag", banco: "bank", barco: "ship boat",
  basura: "wastebasket trash", bebe: "baby", beso: "kiss", bici: "bicycle bike", bicicleta: "bicycle",
  blanco: "white", bolsa: "bag", bombilla: "bulb", bueno: "thumbsup ok", cafe: "coffee", caca: "poop",
  caja: "box package", calavera: "skull", calendario: "calendar date", calor: "hot fire sun",
  cama: "bed", camara: "camera", camion: "truck", campana: "bell", candado: "lock", cara: "face",
  carpeta: "folder file", carro: "cart shopping", carta: "envelope mail letter", casa: "house home",
  caballo: "horse", cerdo: "pig", cerveza: "beer", chocolate: "chocolate", cielo: "sky cloud",
  cine: "movie clapper film cinema", coche: "car automobile", cocina: "cooking cook", cohete: "rocket",
  colegio: "school", comida: "food meal", compras: "shopping cart bag", copa: "wine glass trophy",
  corazon: "heart", correo: "mail email envelope", corona: "crown", cruz: "cross x", cumple: "birthday cake",
  dados: "die game", deporte: "sport soccer basketball", dientes: "tooth", dinero: "money dollar euro",
  documento: "page document memo", dormir: "sleep zzz bed", dragon: "dragon", enfadado: "angry rage",
  escuela: "school", estrella: "star", estudio: "books school", euro: "euro", familia: "family",
  fantasma: "ghost", feliz: "smile happy grin", fiesta: "party tada confetti", flor: "flower blossom",
  foto: "camera photo", fresa: "strawberry", frio: "cold snow ice", fruta: "fruit apple",
  fuego: "fire flame", futbol: "soccer", gafas: "glasses", gallina: "chicken", gato: "cat",
  gimnasio: "weight lifting muscle", grafico: "chart", guitarra: "guitar", hamburguesa: "hamburger",
  helado: "ice cream", herramienta: "tool wrench hammer", hielo: "ice", hombre: "man", hora: "clock",
  hospital: "hospital", huevo: "egg", idea: "bulb", iglesia: "church", isla: "island", juego: "game video_game",
  libro: "book books", limon: "lemon", llave: "key", lluvia: "rain umbrella", lapiz: "pencil memo",
  luna: "moon", maleta: "luggage briefcase", mando: "video_game joystick", mano: "hand", manzana: "apple",
  mapa: "map world", mar: "ocean water wave", martillo: "hammer", medalla: "medal", medico: "health doctor stethoscope",
  mesa: "table", microfono: "microphone", mono: "monkey", montana: "mountain", morado: "purple",
  moto: "motorcycle", mujer: "woman", mundo: "world globe earth", musica: "music note",
  naranja: "orange tangerine", negro: "black", nieve: "snow", nino: "child boy", nina: "girl",
  noche: "night moon", nota: "memo note pencil", nube: "cloud", ojo: "eye", ok: "ok check",
  ordenador: "computer laptop desktop", oro: "gold", oso: "bear", pajaro: "bird", pan: "bread",
  papel: "page paper", paraguas: "umbrella", pastilla: "pill", pelicula: "movie film", pelota: "ball",
  perro: "dog", persona: "person", pez: "fish", pizza: "pizza", planta: "plant seedling", platano: "banana",
  playa: "beach", premio: "trophy medal", queso: "cheese", rayo: "zap lightning", regalo: "gift present",
  reloj: "clock watch", risa: "joy laugh rofl", robot: "robot", rojo: "red", ropa: "shirt dress",
  rosa: "rose pink", salud: "health", sol: "sun sunny", sorpresa: "astonished surprised", tarjeta: "card credit",
  tarta: "cake", taza: "cup coffee tea", tele: "tv television", telefono: "phone telephone mobile",
  tiempo: "clock weather", tienda: "store shop", tierra: "earth globe", tomate: "tomato", tortuga: "turtle",
  trabajo: "briefcase office work", tren: "train", triste: "sad cry pensive", trofeo: "trophy", unicornio: "unicorn",
  uva: "grapes", vaca: "cow", verde: "green", verdura: "vegetable carrot broccoli", viaje: "travel airplane luggage",
  video: "video movie", vino: "wine", zapato: "shoe",
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Para cada palabra buscada, sus alternativas (ella misma + la traducción). */
export function alternativas(q: string): string[][] {
  return sinTildes(q)
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const alt = [t];
      for (const [es, en] of Object.entries(ES_EN)) {
        if (es === t || (t.length >= 3 && es.startsWith(t))) alt.push(...en.split(" "));
      }
      return alt;
    });
}

/** ¿El texto (nombre + palabras clave) casa con todas las palabras buscadas? */
export const casa = (texto: string, alts: string[][]) => alts.every((alt) => alt.some((a) => texto.includes(a)));

/** Para ordenar resultados: primero los que se llaman justo así («house» antes
 *  que «household»), luego los que lo llevan en el nombre, luego el resto. */
export function puntua(id: string, alts: string[][]): number {
  const partes = id.split(/[_-]/);
  let p = 0;
  for (const alt of alts) {
    if (alt.some((a) => partes.includes(a))) continue;
    p += alt.some((a) => id.includes(a)) ? 1 : 3;
  }
  return p;
}

export { sinTildes };
