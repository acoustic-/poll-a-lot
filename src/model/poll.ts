export interface Poll {
    id: string,
    name: string,
    owner: User,
    created: Date,
    pollItems: PollItem[],
    theme: PollThemesEnum,
    selectMultiple: boolean,
    allowAdd?: boolean,
    moviepoll?: boolean,
}

export interface PollItem {
    id: string,
    name: string,
    voters: User[],
    movieId?: number,
}

export interface User {
    id?: string,
    name?: string,
}

export enum PollThemesEnum {
    default = 'DEFAULT',
    dark = 'DARK',
    light = 'LIGHT',
    rainbow = 'RAINBOW',
}
