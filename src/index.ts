import path from 'path'
import { getLabels } from "./select-label"
// import { single } from './single'
import { agent } from './agent'

export const labels = await getLabels()

if (labels.length == 0) {
    console.log(`⚠️ At least 1 Label should be selected for the script to work`)
    process.exit(0)
}

const template = await Bun.file(path.join(process.cwd(), 'template.json')).json()
console.log(`✅ Read template file`)

await agent(labels[0]!, template)
process.exit(0)