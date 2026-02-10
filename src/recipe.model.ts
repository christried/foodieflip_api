export interface Recipe {
  id: string;
  title: string;
  time: number;
  imagePath: string;
  imageAlt: string;
  ingredients: string[];
  instructions: string[];
  tags: string[];
}
