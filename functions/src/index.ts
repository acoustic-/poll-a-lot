/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
/* eslint-disable no-inner-declarations */

import {HttpsError, HttpsOptions, onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import {Agent} from "https";
import * as admin from "firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require("node-fetch");

admin.initializeApp();

const agent = new Agent({keepAlive: true});
const baseUrl = "https://api.letterboxd.com/api/v0/";

interface IHttpsOptions extends HttpsOptions {
  enforceAppCheck: boolean;
}

interface LetterboxdFilmRequestData {
  tmdbId: number;
}

interface LetterboxdLogEntriesRequestData {
  memberId: string;
  query?: string;
}

let tokenCached:
  | {
      access_token: string;
      exp: number;
      updated: number;
    }
  | undefined = undefined;

exports.letterboxd = onCall(
  {
    // Reject requests with missing or invalid App Check tokens.
    enforceAppCheck: true,
    secrets: ["LETTERBOXD_KEY", "LETTERBOXD_SECRET"],
  } as IHttpsOptions,
  async (request) => {
    const token = await getToken();
    const data: LetterboxdFilmRequestData = request.data;

    return getFilm(`tmdb:${data.tmdbId}`, token).then((response: any) => {
      return response;
    });
  }
);

exports.letterboxdLogs = onCall(
  {
    // Reject requests with missing or invalid App Check tokens.
    enforceAppCheck: true,
    // consumeAppCheckToken: true, // Consume the token after verification.
    secrets: ["LETTERBOXD_KEY", "LETTERBOXD_SECRET"],
  } as IHttpsOptions,
  async (request) => {
    const token = await getToken();
    const data: LetterboxdLogEntriesRequestData = request.data;

    return getLogEntries(data.memberId, token, data.query).then(
        (response: any) => {
          return response;
        }
    );
  }
);

function authenticate(): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
  };

  const options = {
    agent,
    method: "POST",
    headers,
    body: `grant_type=client_credentials&client_id=${process.env.LETTERBOXD_KEY}&client_secret=${process.env.LETTERBOXD_SECRET}`,
    params: {
      grant_type: "client_credentials",
      client_id: process.env.LETTERBOXD_KEY,
      client_secret: process.env.LETTERBOXD_SECRET,
    },
  };

  const url = `${baseUrl}auth/token`;

  return fetch(url, options).then((response: any) => response.json());
}

async function getToken(): Promise<string> {
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
        await authenticate()
            .then(async (data) => {
              const accessToken = `${data.token_type} ${data.access_token}`;
              const updated = new Date();

              const expires = new Date(
                  updated.getTime() + data.expires_in * 1000
              );

              const entry = {
                access_token: accessToken,
                exp: expires.getTime(),
                updated: updated.getTime(),
              };

              tokenCached = entry;
              const document = admin
                  .firestore()
                  .collection("tokens")
                  .doc("letterboxd");
              await document.update(entry);
              token = accessToken;
            })
            .catch((error) => {
              throw new HttpsError(
                  "failed-precondition",
                  "Error with authenticate http request.",
                  error
              );
            });
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

  return token;
}

function getFilm(letterboxId: string, token: string) {
  const headers = {Authorization: token};

  const options = {
    agent,
    headers,
  };
  const url = `${baseUrl}film/${letterboxId}`;

  return fetch(url, options)
      .then((response: any) => response.json())
      .catch((error: any) => {
        throw new HttpsError(
            "failed-precondition",
            `Letterboxd film api call (${letterboxId}) failed with error:`,
            error
        );
      });
}

function getLogEntries(memberId: string, token: string, query?: string) {
  const headers = {Authorization: token};

  const options = {
    agent,
    headers,
  };
  const url = `${baseUrl}log-entries?member=${memberId}${ query ? `&${ query }`: ""}`;

  return fetch(url, options)
      .then((response: any) => response.json())
      .catch((error: any) => {
        throw new HttpsError(
            "failed-precondition",
            `Letterboxd log-entries api call (${memberId}) failed with error:`,
            error
        );
      });
}
