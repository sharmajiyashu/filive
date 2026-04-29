import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminRole extends Document {
  name: string;
  description?: string;
  permissions: Array<{
    moduleName: string;
    enabled: boolean;
    features: {
      [featureName: string]: {
        enabled: boolean;
        description: string;
      };
    };
  }>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AdminRoleSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },
    permissions: [
      {
        moduleName: { type: String, required: true },
        enabled: { type: Boolean, default: false },
        features: { type: Schema.Types.Mixed },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IAdminRole>('AdminRole', AdminRoleSchema);
