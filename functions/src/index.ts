/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
/* eslint-disable no-inner-declarations */

import {HttpsError, HttpsOptions, onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import axios, {AxiosResponse} from "axios";
import * as admin from "firebase-admin";
// import functions = require("firebase-functions/v1");

admin.initializeApp();

interface IHttpsOptions extends HttpsOptions {
  enforceAppCheck: boolean;
}

interface LetterboxdRequestData {
  tmdbId: number;
}

let tokenCached: {
  access_token: string,
  exp: number,
  updated: number,
} | undefined = undefined;

// exports.letterboxd1 = functions.runWith({
//   enforceAppCheck: true, // Reject requests with missing or invalid App Check tokens.
//   // consumeAppCheckToken: true, // Consume the token after verification.
//   secrets: ["LETTERBOXD_KEY", "LETTERBOXD_SECRET"],
// })
//     .https.onCall(async (data: LetterboxdRequestData, context: any) => {
//     // context.app contains data from App Check, including the app ID.
//     // Your function logic follows.
//       logger.info("<Letterbox> function call: onCall -> request", data, context);

//       const document = admin.firestore().collection("tokens").doc("letterboxd");

//       let token: string | undefined = undefined;

//       const tokenEntry = await document.get();
//       const tokenData = tokenEntry.data();

//       const now = Date.now();
//       if (now < tokenData?.exp) {
//         token = tokenData?.access_token;
//       } else {
//         async function newToken() {
//           try {
//             const response = await authenticate();

//             const accessToken = `${response.data.token_type} ${response.data.access_token}`;
//             const updated = new Date();

//             const expires = new Date(
//                 updated.getTime() + response.data.expires_in * 1000
//             );

//             const entry = {
//               access_token: accessToken,
//               exp: expires.getTime(),
//               updated: updated.getTime(),
//             };

//             await document.update(entry);
//             token = accessToken;
//           } catch (err) {
//             throw new HttpsError("failed-precondition", "Updating token failed.");
//           }
//         }
//         await newToken();
//       }

//       // TODO: Make actual api request
//       if (!token) {
//         throw new HttpsError(
//             "failed-precondition",
//             "Token renewal failed. " +
//           "Check the correct credentials or contact admnins."
//         );
//       }

//       const filmId: string = await getFilmByTmdbId(data.tmdbId, token)
//           .then((res) => {
//             return res.data.items[0].id as string;
//           })
//           .catch((error) => {
//             throw new HttpsError(
//                 "failed-precondition",
//                 `Letterboxd films api call (${data.tmdbId}) failed with error:`,
//                 error
//             );
//           });
//       return getFilm(filmId, token)
//           .then((res) => {
//             return res.data;
//           })
//           .catch((error) => {
//             throw new HttpsError(
//                 "failed-precondition",
//                 `Letterboxd film api call (${filmId}) failed with error:`,
//                 error
//             );
//           });
//     });

exports.letterboxd = onCall(
  {
    // Reject requests with missing or invalid App Check tokens.
    enforceAppCheck: true,
    // consumeAppCheckToken: true, // Consume the token after verification.
    secrets: ["LETTERBOXD_KEY", "LETTERBOXD_SECRET"],
  } as IHttpsOptions,
  async (request) => {
    logger.info("<Letterbox> function call: onCall -> request", request);
    const data: LetterboxdRequestData = request.data;

    let token: string | undefined = undefined;
    const now = Date.now();

    if (tokenCached !== undefined && now < tokenCached.exp) {
      token = tokenCached.access_token;
    } else {
      const document = admin.firestore().collection("tokens").doc("letterboxd");
      const tokenEntry = await document.get();
      const tokenData = tokenEntry.data();

      if (now < tokenData?.exp) {
        token = tokenData?.access_token;
      }
    }

    if (!token) {
      async function newToken() {
        try {
          const response = await authenticate();

          const accessToken = `${response.data.token_type} ${response.data.access_token}`;
          const updated = new Date();

          const expires = new Date(
              updated.getTime() + response.data.expires_in * 1000
          );

          const entry = {
            access_token: accessToken,
            exp: expires.getTime(),
            updated: updated.getTime(),
          };

          tokenCached = entry;
          const document = admin.firestore().collection("tokens").doc("letterboxd");
          await document.update(entry);

          token = accessToken;
        } catch (err) {
          throw new HttpsError("failed-precondition", "Updating token failed.");
        }
      }
      await newToken();
    }

    // TODO: Make actual api request
    if (!token) {
      throw new HttpsError(
          "failed-precondition",
          "Token renewal failed. " +
          "Check the correct credentials or contact admnins."
      );
    }

    const filmId: string = await getFilmByTmdbId(data.tmdbId, token)
        .then((res) => {
          return res.data.items[0].id as string;
        })
        .catch((error) => {
          throw new HttpsError(
              "failed-precondition",
              `Letterboxd films api call (${data.tmdbId}) failed with error:`,
              error
          );
        });
    return getFilm(filmId, token)
        .then((res) => {
          return res.data;
        })
        .catch((error) => {
          throw new HttpsError(
              "failed-precondition",
              `Letterboxd film api call (${filmId}) failed with error:`,
              error
          );
        });
  }
);

const baseUrl = "https://api.letterboxd.com/api/v0/";

function authenticate(): Promise<
  AxiosResponse<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }>
  > {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
  };

  return axios.post<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }>(
      `${baseUrl}auth/token`,

      `grant_type=client_credentials&client_id=${process.env.LETTERBOXD_KEY}&client_secret=${process.env.LETTERBOXD_SECRET}`,
      {
        headers,
        params: {
          grant_type: "client_credentials",
          client_id: process.env.LETTERBOXD_KEY,
          client_secret: process.env.LETTERBOXD_SECRET,
        },
      }
  );
}

function getFilmByTmdbId(
    tmdbId: number,
    token: string
): Promise<AxiosResponse<{ items: any[] }>> {
  return axios.get<{ items: any[] }>(`${baseUrl}films?filmId=tmdb:${tmdbId}`, {
    headers: {Authorization: token},
  });
}

function getFilm(
    letterboxId: string,
    token: string
): Promise<AxiosResponse<any>> {
  return axios.get<any>(
      `${baseUrl}film/${letterboxId}`,

      {
        headers: {Authorization: token},
      }
  );
}
