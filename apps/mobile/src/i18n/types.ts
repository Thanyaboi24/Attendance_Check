/** Same nested keys as the English namespace, every leaf a string: the Thai file must translate every key. */
export type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> };
