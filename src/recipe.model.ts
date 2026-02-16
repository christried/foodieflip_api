export interface Recipe {
  id: string;
  title: string;
  time: number;
  imagePath: string;
  imageUrl?: string;
  fullsizeUrl?: string;
  imageAlt: string;
  ingredients: string[];
  instructions: string[];
  tags_public: string[];
  tags_internal: string[];
  upvotes: number;
  downvotes: number;
  submittedBy: string;
}
