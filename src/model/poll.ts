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
    seriesPoll?: boolean,
    showPollItemCreators?: boolean,
}

export interface PollItem {
    id: string,
    name: string,
    voters: User[],
    movieId?: number,
    seriesId?: number,
    creator?: User,
    reactions?: { label: string; users: User[] }[],
    description?: string,
    tags?: string[];
}

export interface User {
    id?: string,
    name?: string,
    localUserId?: string,
}

export enum PollThemesEnum {
    default = 'DEFAULT',
    dark = 'DARK',
    light = 'LIGHT',
    rainbow = 'RAINBOW',
}
