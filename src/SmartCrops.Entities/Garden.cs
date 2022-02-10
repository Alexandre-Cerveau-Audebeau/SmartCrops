using System.ComponentModel.DataAnnotations;

namespace SmartCrops.Entities
{
    public class Garden
    {
        [Key]
        public int Id { get; set; }
        public Ground Grounds { get; set; }

        [Required]
        [MinLength(2)]
        [MaxLength(255)]
        public string Country { get; set; }

        [Required]
        [MinLength(2)]
        [MaxLength(255)]
        public string City { get; set; }
    }
}