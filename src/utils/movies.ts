export const BOLLYWOOD_MOVIES = [
  "Dangal", "Sholay", "Lagaan", "3 Idiots", "Dilwale Dulhania Le Jayenge",
  "Bajrangi Bhaijaan", "Gully Boy", "Queen", "Andhadhun", "Drishyam",
  "Hera Pheri", "Munna Bhai MBBS", "PK", "Zindagi Na Milegi Dobara",
  "Chhichhore", "Kabir Singh", "Article 15", "Tumbbad", "Newton",
  "Barfi", "Gangs of Wasseypur", "Om Shanti Om", "Dil Se", "Taare Zameen Par",
  "Rockstar", "Jab We Met", "Dil Chahta Hai", "Swades", "Kal Ho Naa Ho",
  "Chak De India"
];

export const getRandomMovies = (count: number) => {
  const shuffled = [...BOLLYWOOD_MOVIES].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};
