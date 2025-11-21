import path from 'path'

interface DebugEntry {
    timestamp: string
    iteration: number
    allowModification: boolean
    generatedBody: any
    templateName: string
    fullTemplate: any
}

export async function saveGeneratedTemplate(
    generatedBody: any, 
    templateName: string, 
    fullTemplate: any, 
    iteration: number, 
    allowModification: boolean
) {
    const debugPath = path.join(process.cwd(), 'generated.json')
    
    const debugEntry: DebugEntry = {
        timestamp: new Date().toISOString(),
        iteration,
        allowModification,
        generatedBody,
        templateName,
        fullTemplate
    }
    
    try {
        const file = Bun.file(debugPath)
        let existingData: { entries: DebugEntry[] } = { entries: [] }
        
        if (await file.exists()) {
            try {
                existingData = await file.json()
                if (!existingData.entries) {
                    existingData.entries = []
                }
            } catch (error) {
                // file exists but is invalid, start fresh
                existingData = { entries: [] }
            }
        }
        
        existingData.entries.push(debugEntry)
        
        await Bun.write(debugPath, JSON.stringify(existingData, null, 2))
        console.log(`🐛 Debug: Saved generated template to generated.json`)
    } catch (error) {
        console.error(`⚠️ Failed to save debug info: ${error}`)
    }
}