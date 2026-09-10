import { namesMatch } from '../itinerary.service';

describe('namesMatch', () => {
  it('reconnaît un intitulé enrichi par l’IA', () => {
    // L'IA écrit souvent un titre de journée là où la base porte le seul lieu.
    expect(namesMatch('Castillo de Santa Bárbara & Barrio de la Santa Cruz', 'Castillo de Santa Bárbara')).toBe(true);
    expect(namesMatch('Cascade El Limón & Randonnée tropicale', 'Cascada El Limón')).toBe(true);
  });

  it('tolère une graphie française ou espagnole', () => {
    expect(namesMatch('Cascade El Limón', 'Cascada El Limón')).toBe(true);
    expect(namesMatch('Musée archéologique MARQ', 'Museo Arqueológico MARQ')).toBe(true);
  });

  it('ne rapproche pas deux lieux différents du même genre', () => {
    // Le piège : « plage » est partagé, mais ne dit rien de l'endroit.
    expect(namesMatch('Plage de Las Terrenas', 'Plage de Playa Cosón')).toBe(false);
    expect(namesMatch('Restaurant El Cabito', 'Restaurant La Terrasse')).toBe(false);
    expect(namesMatch('Musée du Rhum', 'Musée des Beaux-Arts')).toBe(false);
  });

  it('ne rapproche rien à partir d’un intitulé générique', () => {
    // Les noms de la trame de repli ne doivent JAMAIS matcher un vrai lieu.
    expect(namesMatch('Le musée principal', 'Museo Arqueológico Provincial')).toBe(false);
    expect(namesMatch('Table du centre-ville', 'El Cabito')).toBe(false);
  });

  it('reste faux sur un nom vide ou réduit à des mots vides', () => {
    expect(namesMatch('', 'Castillo de Santa Bárbara')).toBe(false);
    expect(namesMatch('de la', 'Castillo de Santa Bárbara')).toBe(false);
  });
});
