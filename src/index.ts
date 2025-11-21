import path from 'path'
import prompts from 'prompts'
import { getLabels } from "./select-label"
// import { single } from './single'
import { agent } from './agent'

export const labels = await getLabels()

if (!labels || labels.length == 0) {
    console.log(`⚠️ At least 1 Label should be selected for the script to work`)
    process.exit(0)
}

// ask user if they want to modify the original template content using toggle
const modificationChoice = await prompts({
    type: 'toggle',
    name: 'allowModification',
    message: 'Is changing the original template content allowed?',
    initial: true,
    active: 'yes',
    inactive: 'no'
})

// check if user cancelled the prompt
if (modificationChoice.allowModification === undefined) {
    console.log('⚠️ Operation cancelled by user')
    process.exit(0)
}

const template = await Bun.file(path.join(process.cwd(), 'template.json')).json()
console.log(`✅ Read template file`)

await agent(labels[0]!, template, modificationChoice.allowModification)
process.exit(0)