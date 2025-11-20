import { generate } from "./generate"
import { register } from "./register"
import type { Label } from "./select-label"
import { getTemplateName } from "./template-names"

export async function single(template: any, labels: Label[]) {
    const body = await generate(template)
    console.log(`✅ Generated modified template using AI`)

    const replaced = {
        ...template,
        components: template.components.map((comp: any) => comp.type == 'BODY' ? body : comp),
        name: getTemplateName()
    }
    console.log(`✅ Crafted replacement`)

    const registered = await register(labels[0]!, replaced)

    if (registered) {
        return registered
    }
}