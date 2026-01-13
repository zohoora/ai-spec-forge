// Session configuration types matching spec 8.1

export interface Prompts {
  specWriterClarify: string;
  specWriterClarifyRefinement: string;  // For refining existing specs
  specWriterSnapshot: string;
  specWriterDraft: string;
  specWriterRevise: string;
  consultant: string;
}

export interface SessionConfig {
  appIdea: string;
  existingSpec: string | null;  // Imported spec for refinement mode
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

  const hasExistingSpec = config.existingSpec && config.existingSpec.trim().length > 0;

  // appIdea is required for new specs, optional description for refinements
  if (!hasExistingSpec && !config.appIdea?.trim()) {
    errors.push({ field: 'appIdea', message: 'App idea is required' });
  }

  // Validate existingSpec if provided
  if (hasExistingSpec) {
    const specLength = config.existingSpec!.trim().length;
    if (specLength < 100) {
      errors.push({ field: 'existingSpec', message: 'Imported spec is too short (minimum 100 characters)' });
    }
    if (specLength > 500000) {
      errors.push({ field: 'existingSpec', message: 'Imported spec is too long (maximum 500,000 characters)' });
    }
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
    existingSpec: null,
    specWriterModel: '',
    consultantModels: [],
    numberOfRounds: 3,
    outputDirectory: '',
  };
}
