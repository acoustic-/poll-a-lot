import { inject, Injectable } from "@angular/core";
import { AI, GenerativeModel, getGenerativeModel } from "@angular/fire/ai";

@Injectable({
  providedIn: "root",
})
export class GeminiService {
  private model: GenerativeModel;

  constructor(private ai: AI) {

    this.model = getGenerativeModel(this.ai, {
      model: "gemini-2.0-flash-lite-001",
      // systemInstruction: systemInstruction,
      // tools: [productsToolSet],
    });
  }

  async generateMoviePollDescription(pollName: string, pollDescription?: string, movieTitles: string[] = []) {
    const movielist = this.moviesString(movieTitles);
    const prompt = `
    Write a captivating introductory text for a movie poll called "${pollName}" targeting a diverse audience of passionate cinephiles and casual viewers. The goal is to generate excitement and encourage users to actively participate in the poll and find favourites.
    ${ pollDescription ? `Poll was described by the creator of the poll with the following description: ${pollDescription}. Please use the language in the description when answering.` : ''}

    Movie List:
    ${movielist}

    Text Guidelines:
    Highlight unique qualities: Compare genres, topics, styles, and shared elements like directors or cast.
    Provide short introductions: Briefly describe each movie, including its title and year. Use facts about main characters and iconic quotes or cultural significance.
    Emphasize the difficult choice: Mention standout facts, performances, or trivia to make each option appealing.
    Use a strong opening and closing: Begin with a captivating sentence and end with a compelling statement.
    Format with Markdown: Use bold formatting for movie titles and years, and emphasize key points for impact.
    Character limit: Keep descriptions around minimum of 150 characters each.
    Don't give away the ending or spoil the movies.
    Example Introduction:
    Are you ready to embark on an epic cinematic journey? From the haunting depths of psychological thrillers to the exhilarating heights of fantasy adventures, the "Jarin Testi" poll offers a diverse selection of six films that will leave you pondering the ultimate question: Which movie will you choose?`;
    // To generate text output, call generateContent with the text input
    const result = await this.model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    return text;
  }

  async generateSelectedMoviesDescription(pollName: string, pollDescription?: string, movieTitles: string[] = []): Promise<string> {
    const movielist = this.moviesString(movieTitles);
    const prompt = `
      Please introduce the selected movies or movie in the movie list. The event name is "${pollName}". ${ pollDescription ? `Poll was described by the creator of the poll with the following description: "${pollDescription}". Please use the language of the description for the whole response when answering.` : ''}

      Movie List:
      ${movielist}

      Start with a short intruction about the movies in the list in general, for example how the movies are related, what combines them, what are the general themes of what are striking differences. Use 2 - 3 sentences. 
      Then continue with individual introductions of the movies. This starts with the name of the movie and the production year in bold.
      Then a single paragrap with the following information about each movie (this should be in lead paragraph style, this should be formatted to be in italic, separated with character | in between): Director, Main actors, Genre, Duration.
      Then short main paragrah in normal text with following information: a brief plot summary (2-3 sentences), notable awards or nominations and any interesting trivia or behind-the-scenes facts.

      Add total duration of the movies if there are more than one movie. Please use simple Markdown formatting for the output.
    `;
    // To generate text output, call generateContent with the text input
    let result;
    try {
      result = await this.model.generateContent(prompt);
    } catch (error) {
      console.log("AI generation failed...", error);
    }

    const response = result.response;
    return response.text();
  }

  async generateVoteSuggestionDescription(movieTitles: string[] = [], suggestMovie: string | undefined = undefined) {
    const movielist = this.moviesString(movieTitles);
    const prompt = `
    Play the role of passionate, knowlegable movie connoisseur. Suggest user to pick ${ suggestMovie ? `this movie "${ suggestMovie }"` : 'one movie' }${ movieTitles ? `from the following movie choices: ${movielist}` : '' }. Use knowledge of the influence of the chosen movie and rememberable moments or perfomance in the movie. Rules: Give answer in single paragrah. Suggest only one movie to pick. Use same formatting for movies names and production years as in the movie list.`;
    // To generate text output, call generateContent with the text input
    let result;
    try {
      result = await this.model.generateContent(prompt);
    } catch (error) {
      console.log("AI generation failed...", error);
    }

    const response = result.response;
    const text = response.text();
    return text;
  }

  async generateNewMovieSuggestions(movieTitles: string[] = [], pollName?: string, pollDescription?: string) {
    const movielist = this.moviesString(movieTitles);
    const prompt = `
    Current movie list:
    ${movielist}
    Suggest other movies based on this selection to add for voting.
    ${ pollName ? `Movie poll is named ${pollName}.` : ''}
    ${ pollDescription ? `Poll was described by the creator of the poll with the following description: ${pollDescription}. Please use the language in the description when answering.` : ''}

    Text rules:
    Highlight unique qualities: Compare genres, topics, styles, and shared elements like directors or cast.
    Provide short introductions: Briefly describe each movie, including its title and year. Use facts about main characters and iconic quotes or cultural significance.
    Format with Markdown: Use bold formatting for movie titles and years, and emphasize key points for impact.
    Don't give away the ending or spoil the movies.
    `;
    // To generate text output, call generateContent with the text input
    const result = await this.model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    return text;
  }

  async generateNewMovieSuggestionList(movieTitles: string[] = [], pollName: string, pollDescription?: string) {
    const movielist = this.moviesString(movieTitles);

    const promptWithMovies = `
      Current movie list:
      ${movielist}

      Suggest other movies based on this selection to add for voting with emphasis on less known but culturally significant films. Limit response suggestions to 20 movies.`;

    const promptWithoutMovies = `
      Suggest movies with emphasis on less known but culturally significant films. Limit response suggestions to 20 movies."
    `;

    const prompt = `
      ${ movieTitles.length ? promptWithMovies : promptWithoutMovies}
      ${ pollName ? `Movie poll is named ${pollName}` : ''}
      ${ pollDescription ? `Poll was described by the creator of the poll with the following description: ${pollDescription}. Please use the language in the description when answering.` : ''}
      The answer should be in CSV format including only two columns: name of. the movie and the release year of the movie. There is no other content than the CSV response. Don't give away the ending or spoil the movies.
    `;
    // To generate text output, call generateContent with the text input
    const result = await this.model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    return text;
  }

  private moviesString(movieTitles: string[] = []): string {
    if (movieTitles.length === 0) {
      return 'The suggestion list is still empty. Help user to pick the first movie.';
    } else if ( movieTitles.length === 1) {
      return movieTitles[0];
    } else {
      const start = movieTitles.slice(0, movieTitles.length - 1);
      const movielist = `${start.join(", ")} and ${
        movieTitles[movieTitles.length - 1]
      }`;
      return movielist;
    }
  }
}
