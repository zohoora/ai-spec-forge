// Session configuration types matching spec 8.1

export interface Prompts {
  specWriterClarify: string;
  specWriterSnapshot: string;
  specWriterDraft: string;
  specWriterRevise: string;
  consultant: string;
}

export interface SessionConfig {
  appIdea: string;
  specWriterModel: string;
  consultantModels: string[];
  numberOfRounds: number;
  prompts: Prompts;
  outputDirectory: string;
  createdAt: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export function validateConfig(config: Partial<SessionConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!config.appIdea?.trim()) {
    errors.push({ field: 'appIdea', message: 'App idea is required' });
  }

  if (!config.specWriterModel?.trim()) {
    errors.push({ field: 'specWriterModel', message: 'Spec writer model is required' });
  }

  if (!config.consultantModels || config.consultantModels.length < 1) {
    errors.push({ field: 'consultantModels', message: 'At least 1 consultant model is required' });
  } else if (config.consultantModels.length > 5) {
    errors.push({ field: 'consultantModels', message: 'Maximum 5 consultant models allowed' });
  }

  if (config.numberOfRounds === undefined || config.numberOfRounds < 1 || config.numberOfRounds > 10) {
    errors.push({ field: 'numberOfRounds', message: 'Number of rounds must be between 1 and 10' });
  }

  if (!config.outputDirectory?.trim()) {
    errors.push({ field: 'outputDirectory', message: 'Output directory is required' });
  }

  return errors;
}

export function createDefaultConfig(): Partial<SessionConfig> {
  return {
    appIdea: '',
    specWriterModel: '',
    consultantModels: [],
    numberOfRounds: 3,
    outputDirectory: '',
  };
}
