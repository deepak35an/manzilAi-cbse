import Badge from '../ui/Badge'
import Card from '../ui/Card'

interface SkillExtractorProps {
  skills: string[]
  experienceLevel?: string
  roleTitle?: string
}

export default function SkillExtractor({ skills, experienceLevel, roleTitle }: SkillExtractorProps) {
  return (
    <Card className="p-5">
      {roleTitle && <h3 className="text-lg font-semibold text-gray-900 mb-1">{roleTitle}</h3>}
      {experienceLevel && <p className="text-sm text-gray-500 mb-3">Level: {experienceLevel}</p>}
      <p className="text-sm text-gray-600 mb-2">Extracted Skills:</p>
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => <Badge key={skill} variant="info">{skill}</Badge>)}
      </div>
    </Card>
  )
}
