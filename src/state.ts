import { atom } from "recoil"

const hintState = atom<string | undefined>({
    key: "hintState",
    default: undefined
})

export { hintState }