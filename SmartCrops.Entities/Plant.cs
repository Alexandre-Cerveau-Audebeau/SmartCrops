using System.ComponentModel.DataAnnotations;

namespace SmartCrops.Entities
{
    public class Plant {

        [Key]
        public int Id { get; set; }
        public PlantType Type { get; set; }
    }

        
}