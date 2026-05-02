import * as yaml from 'js-yaml';
import * as fs from 'fs';
import { MBDManifest, Requirement, StateMachine } from '../types';

export class ManifestParser {
  loadFromFile(filePath: string): MBDManifest {
    const content = fs.readFileSync(filePath, 'utf-8');
    return this.parse(content);
  }

  parse(yamlContent: string): MBDManifest {
    const raw = yaml.load(yamlContent) as any;
    if (!raw || typeof raw !== 'object') throw new Error('Invalid manifest: not a YAML object');
    if (!raw.version) throw new Error('Manifest missing required field: version');
    if (!raw.project) throw new Error('Manifest missing required field: project');
    if (!Array.isArray(raw.requirements)) throw new Error('Manifest missing required field: requirements (must be array)');

    const requirements: Requirement[] = raw.requirements.map((r: any, i: number) => {
      if (!r.id) throw new Error(`Requirement at index ${i} missing required field: id`);
      if (!r.title) throw new Error(`Requirement ${r.id} missing required field: title`);
      return {
        id: r.id,
        title: r.title,
        description: r.description || '',
        category: r.category,
        priority: r.priority,
        keywords: Array.isArray(r.keywords) ? r.keywords : [],
        expectedFiles: Array.isArray(r.expectedFiles) ? r.expectedFiles : undefined,
        stateMachine: r.stateMachine ? {
          name: r.stateMachine.name,
          transition: r.stateMachine.transition,
        } : undefined,
      };
    });

    const stateMachines: StateMachine[] = Array.isArray(raw.stateMachines)
      ? raw.stateMachines.map((sm: any) => ({
          name: sm.name,
          states: Array.isArray(sm.states) ? sm.states : [],
          transitions: Array.isArray(sm.transitions) ? sm.transitions : [],
        }))
      : [];

    return {
      version: String(raw.version),
      project: raw.project,
      description: raw.description,
      requirements,
      stateMachines,
    };
  }
}
